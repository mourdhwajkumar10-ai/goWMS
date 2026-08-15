package grn

import (
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerEvidenceRoutes(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/session/:id/coa", attachCOA(db))
	r.Post("/exceptions/:id/evidence", attachExceptionEvidence(db))
	r.Post("/session/:id/supplier-scan", scanSupplierBarcode(db))
}

func latestExceptionID(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, kind string) int {
	var id int
	_ = db.QueryRow(c.Context(), `
		SELECT id FROM grn_exceptions
		WHERE grn_session_id=$1 AND exception_type=$2
		ORDER BY id DESC LIMIT 1`, sessionID, kind).Scan(&id)
	return id
}

func attachCOA(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			AttachmentID int `json:"attachment_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.AttachmentID < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "attachment_id required")
		}
		var filename string
		_ = db.QueryRow(c.Context(), `SELECT filename FROM attachments WHERE id=$1`, body.AttachmentID).Scan(&filename)
		_, _ = db.Exec(c.Context(), `
			UPDATE attachments SET entity_type='grn_coa', entity_id=$2 WHERE id=$1`, body.AttachmentID, sessionID)
		tag, err := db.Exec(c.Context(), `
			UPDATE grn_exceptions
			SET status='resolved', resolution=$2, resolved_by=$3, resolved_at=now()
			WHERE grn_session_id=$1 AND exception_type='missing_coa' AND status IN ('open','pending')`,
			sessionID, "COA uploaded: "+filename, userID(c))
		if err != nil && strings.Contains(err.Error(), "resolved_by") {
			tag, err = db.Exec(c.Context(), `
				UPDATE grn_exceptions
				SET status='resolved', resolution=$2, resolved_at=now()
				WHERE grn_session_id=$1 AND exception_type='missing_coa' AND status IN ('open','pending')`,
				sessionID, "COA uploaded: "+filename)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		writeEvent(db, c, sessionID, "COA_UPLOADED", fiber.Map{
			"result":  "coa_uploaded",
			"payload": fiber.Map{"attachment_id": body.AttachmentID, "filename": filename},
		})
		resolved := tag.RowsAffected()
		return shared.OK(c, fiber.Map{
			"ok": true, "attachment_id": body.AttachmentID, "filename": filename, "resolved": resolved,
		})
	}
}

func attachExceptionEvidence(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		excID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid exception id")
		}
		var body struct {
			AttachmentID int `json:"attachment_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.AttachmentID < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "attachment_id required")
		}
		var sessionID int
		var et string
		err = db.QueryRow(c.Context(), `SELECT grn_session_id, exception_type FROM grn_exceptions WHERE id=$1`, excID).
			Scan(&sessionID, &et)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "exception not found")
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE attachments SET entity_type='grn_exception', entity_id=$2 WHERE id=$1`, body.AttachmentID, excID)
		writeEvent(db, c, sessionID, "EVIDENCE_ATTACHED", fiber.Map{
			"result":  et,
			"payload": fiber.Map{"exception_id": excID, "attachment_id": body.AttachmentID},
		})
		return shared.OK(c, fiber.Map{"ok": true, "exception_id": excID, "attachment_id": body.AttachmentID})
	}
}

func scanSupplierBarcode(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			Barcode string `json:"barcode"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		code := strings.TrimSpace(body.Barcode)
		if code == "" {
			return shared.Err(c, fiber.StatusBadRequest, "barcode required")
		}
		result := matchSupplierBarcode(c, db, sessionID, code)
		if result["mismatch"] == true {
			writeException(db, c, sessionID, "wrong_supplier", fiber.Map{})
			writeEvent(db, c, sessionID, "WRONG_SUPPLIER", fiber.Map{
				"result": "wrong_supplier", "payload": result,
			})
		} else {
			writeEvent(db, c, sessionID, "SUPPLIER_BARCODE_CHECKED", fiber.Map{
				"result": "ok", "payload": result,
			})
		}
		return shared.OK(c, result)
	}
}

func matchSupplierBarcode(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, code string) fiber.Map {
	var expected string
	_ = db.QueryRow(c.Context(), `
		SELECT COALESCE(gs.supplier_name, po.supplier_name, '')
		FROM grn_sessions gs
		LEFT JOIN purchase_orders po ON po.name = gs.purchase_receipt_no
		WHERE gs.id=$1`, sessionID).Scan(&expected)
	var foundName, foundGSTIN, foundBarcode string
	err := db.QueryRow(c.Context(), `
		SELECT name, COALESCE(gstin,''), COALESCE(barcode,'')
		FROM suppliers
		WHERE disabled=false AND (
			lower(btrim(barcode))=lower(btrim($1))
			OR lower(btrim(COALESCE(gstin,'')))=lower(btrim($1))
		)
		ORDER BY id LIMIT 1`, code).Scan(&foundName, &foundGSTIN, &foundBarcode)
	if err != nil {
		return fiber.Map{
			"ok": false, "found": false, "mismatch": false, "barcode": code,
			"expected_supplier": expected,
			"message":           "No supplier master matches this barcode. Confirm the supplier manually.",
		}
	}
	mismatch := expected != "" && !shared.NamesMatch(expected, foundName)
	msg := "Supplier barcode matches " + foundName
	if mismatch {
		msg = "WRONG SUPPLIER — barcode is " + foundName + ", this GRN expects " + expected
	}
	return fiber.Map{
		"ok": true, "found": true, "mismatch": mismatch, "barcode": code,
		"scanned_supplier": foundName, "expected_supplier": expected, "message": msg,
	}
}
