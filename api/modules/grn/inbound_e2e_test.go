package grn

import (
	"context"
	"net/http"
	"testing"

	"goWMS/api/internal/testdb"
	"github.com/jackc/pgx/v5/pgxpool"
)

func testPoolForInbound(t *testing.T) *pgxpool.Pool {
	return testdb.Open(t)
}

// TestInboundE2E_25Scenarios exercises the full inbound pipeline end-to-end:
// dock receive → transporter sign-off → item verify → GRN close → putaway.
func TestInboundE2E_25Scenarios(t *testing.T) {
	cases := []struct {
		name string
		run  func(t *testing.T)
	}{
		{"01_full_happy_path_two_boxes", e2e01FullHappyPath},
		{"02_signoff_one_of_two_marks_missing", e2e02SignoffMarksMissing},
		{"03_late_arrival_after_signoff", e2e03LateArrival},
		{"04_signoff_requires_at_least_one_box", e2e04SignoffZeroBoxes},
		{"05_duplicate_dock_scan", e2e05DuplicateDockScan},
		{"06_box_not_on_packing_list", e2e06BoxNotOnList},
		{"07_damaged_box_at_dock", e2e07DamagedBox},
		{"08_transporter_signoff_idempotent", e2e08SignoffIdempotent},
		{"09_missing_box_before_signoff_normal", e2e09MissingBeforeSignoff},
		{"10_item_full_match_completes_box", e2e10ItemFullMatch},
		{"11_item_shortage_on_box_complete", e2e11ItemShortage},
		{"12_item_excess_scan", e2e12ItemExcess},
		{"13_unknown_item_in_box", e2e13UnknownItem},
		{"14_reject_item_routes_reject", e2e14RejectItem},
		{"15_complete_box_idempotent", e2e15CompleteBoxIdempotent},
		{"16_complete_verification_blocks_unverified", e2e16VerificationBlocksUnverified},
		{"17_complete_verification_after_all_verified", e2e17VerificationHappy},
		{"18_missing_box_blocks_verification", e2e18MissingBlocksVerification},
		{"19_late_arrival_unlocks_verification", e2e19LateArrivalUnlocks},
		{"20_auto_complete_single_item_scan", e2e20AutoCompleteSingle},
		{"21_incomplete_item_master_blocks_scan", e2e21IncompleteMaster},
		{"22_scan_item_on_closed_session", e2e22ClosedSessionScan},
		{"23_three_boxes_no_missing_on_signoff", e2e23ThreeBoxesSignoff},
		{"24_confirm_already_verified_box", e2e24AlreadyVerified},
		{"25_partial_close_with_shortages", e2e25PartialClose},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tc.run(t)
		})
	}
}

func twoBoxFixture() []e2eBox {
	return []e2eBox{
		{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 2}}},
		{CartonNo: "C0002", Lines: []e2eLine{{ExpectedQty: 3}}},
	}
}

func e2e01FullHappyPath(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	env.receiveBox("C0001", "ok")
	env.receiveBox("C0002", "ok")
	r := env.signOff()
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("signOff: %s", r.Error)
	}
	env.verifyAllBoxes()
	r = env.completeVerification()
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("completeVerification: %s", r.Error)
	}
	st := env.sessionStatus()
	if st != "putaway_pending" && st != "completed" && st != "exception_pending" {
		t.Fatalf("session status=%s want putaway_pending/completed", st)
	}
	if env.cartonStatus("C0001") != "verified" || env.cartonStatus("C0002") != "verified" {
		t.Fatalf("cartons not verified")
	}
	env.completePutawayForGRN(t)
}

func e2e02SignoffMarksMissing(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	env.receiveBox("C0001", "ok")
	r := env.signOff()
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("signOff: %s", r.Error)
	}
	if env.cartonStatus("C0002") != "missing" {
		t.Fatalf("C0002 status=%s want missing", env.cartonStatus("C0002"))
	}
	if env.countOpenExceptions("missing_box") < 1 {
		t.Fatal("expected open missing_box exception for C0002")
	}
	if dataFloat(r.Data, "missing") < 1 {
		t.Fatalf("signOff missing count: %+v", r.Data)
	}
	env.verifyBoxFully("C0001")
	env.partialClose()
	env.completePutawayForGRN(t)
}

func e2e03LateArrival(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	env.receiveBox("C0001", "ok")
	env.signOff()
	r := env.scanBox("C0002", "")
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("scan missing box: %s", r.Error)
	}
	if dataStr(r.Data, "next_action") != "late_arrival" {
		t.Fatalf("next_action=%q want late_arrival", dataStr(r.Data, "next_action"))
	}
	r = env.confirmBox("C0002", "ok")
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("confirm late arrival: %s", r.Error)
	}
	if env.cartonStatus("C0002") != "received" {
		t.Fatalf("C0002 status=%s want received", env.cartonStatus("C0002"))
	}
	if env.countOpenExceptions("missing_box") != 0 {
		t.Fatal("missing_box exception should be resolved after late arrival")
	}
	env.verifyAllBoxes()
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e04SignoffZeroBoxes(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	r := env.signOff()
	if r.Status == http.StatusOK && r.OK {
		t.Fatal("signOff with zero boxes should fail")
	}
	if !mustContain(r.Error, "at least one box") {
		t.Fatalf("error=%q", r.Error)
	}
	env.assertNoPutawayWork(t)
}

func e2e05DuplicateDockScan(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	env.receiveBox("C0001", "ok")
	r := env.scanBox("C0001", "")
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("rescan: %s", r.Error)
	}
	next := dataStr(r.Data, "next_action")
	if next != "already_scanned" {
		t.Fatalf("next_action=%q want already_scanned", next)
	}
	env.signOff()
	env.verifyBoxFully("C0001")
	env.partialClose()
	env.completePutawayForGRN(t)
}

func e2e06BoxNotOnList(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	r := env.scanBox("NOT-A-REAL-BOX", "")
	if r.Status == http.StatusOK && r.OK {
		t.Fatal("unknown box should not succeed")
	}
	if r.Status != http.StatusNotFound {
		t.Fatalf("status=%d want 404", r.Status)
	}
	env.assertNoPutawayWork(t)
}

func e2e07DamagedBox(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 1}}}})
	env.receiveBox("C0001", "damaged")
	if env.cartonStatus("C0001") != "received" {
		t.Fatalf("status=%s", env.cartonStatus("C0001"))
	}
	env.signOff()
	item := env.itemCodeInBox("C0001")
	r := env.scanItem("C0001", item)
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("scan damaged box item: %s", r.Error)
	}
	env.completeBox("C0001")
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e08SignoffIdempotent(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	env.receiveBox("C0001", "ok")
	r1 := env.signOff()
	r2 := env.signOff()
	if r1.Status != http.StatusOK || r2.Status != http.StatusOK {
		t.Fatalf("signOff failed")
	}
	if dataStr(r2.Data, "phase") != "item_verify" {
		t.Fatalf("phase=%q", dataStr(r2.Data, "phase"))
	}
	env.verifyBoxFully("C0001")
	env.partialClose()
	env.completePutawayForGRN(t)
}

func e2e09MissingBeforeSignoff(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	r := env.scanBox("C0002", "")
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("scan: %s", r.Error)
	}
	if dataStr(r.Data, "next_action") == "late_arrival" {
		t.Fatal("late_arrival should not apply before transporter sign-off")
	}
	if dataStr(r.Data, "next_action") != "confirm_condition" {
		t.Fatalf("next_action=%q want confirm_condition", dataStr(r.Data, "next_action"))
	}
	env.assertNoPutawayWork(t)
}

func e2e10ItemFullMatch(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 2}}}})
	env.receiveBox("C0001", "ok")
	env.signOff()
	item := env.itemCodeInBox("C0001")
	env.scanItemQty("C0001", item, 2)
	r := env.completeBox("C0001")
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("completeBox: %s", r.Error)
	}
	if env.cartonStatus("C0001") != "verified" {
		t.Fatalf("status=%s", env.cartonStatus("C0001"))
	}
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e11ItemShortage(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 5}}}})
	env.receiveBox("C0001", "ok")
	env.signOff()
	item := env.itemCodeInBox("C0001")
	env.scanItemQty("C0001", item, 2)
	r := env.completeBox("C0001")
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("completeBox: %s", r.Error)
	}
	if env.countOpenExceptions("shortage") < 1 {
		t.Fatal("expected shortage exception")
	}
	if dataStr(r.Data, "has_exceptions") != "true" && r.Data["has_exceptions"] != true {
		t.Fatalf("has_exceptions: %+v", r.Data)
	}
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e12ItemExcess(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 10}}}})
	env.receiveBox("C0001", "ok")
	env.signOff()
	item := env.itemCodeInBox("C0001")
	env.scanItemQty("C0001", item, 10)
	r := env.scanItem("C0001", item) // 11th unit = 10% over (at tolerance edge)
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("excess scan: %s", r.Error)
	}
	match, ok := r.Data["match"].(map[string]interface{})
	if !ok {
		t.Fatal("expected match payload")
	}
	if dataStr(match, "status") != "excess" {
		t.Fatalf("status=%q want excess", dataStr(match, "status"))
	}
	env.completeBox("C0001")
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e13UnknownItem(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 1}}}})
	env.receiveBox("C0001", "ok")
	env.signOff()
	r := env.scanItem("C0001", "WRONG-ITEM-CODE")
	if r.Status == http.StatusOK && r.OK {
		t.Fatal("unknown item should fail")
	}
	if env.countExceptions("unknown_item") < 1 {
		t.Fatal("expected unknown_item exception")
	}
	item := env.itemCodeInBox("C0001")
	env.scanItemQty("C0001", item, 1)
	env.completeBox("C0001")
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e14RejectItem(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 1}}}})
	env.receiveBox("C0001", "ok")
	env.signOff()
	item := env.itemCodeInBox("C0001")
	r := env.rejectItem("C0001", item)
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("rejectItem: %s", r.Error)
	}
	if dataStr(r.Data, "route_location") != "REJECT-01" {
		t.Fatalf("route=%q want REJECT-01", dataStr(r.Data, "route_location"))
	}
	env.assertNoPutawayWork(t)
}

func e2e15CompleteBoxIdempotent(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 1}}}})
	env.receiveBox("C0001", "ok")
	env.signOff()
	env.verifyBoxFully("C0001")
	r := env.completeBox("C0001")
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("idempotent complete: %s", r.Error)
	}
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e16VerificationBlocksUnverified(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	env.receiveBox("C0001", "ok")
	env.receiveBox("C0002", "ok")
	env.signOff()
	r := env.completeVerification()
	if r.Status == http.StatusOK && r.OK {
		t.Fatal("complete verification should fail with unverified boxes")
	}
	if !mustContain(r.Error, "item verification") {
		t.Fatalf("error=%q", r.Error)
	}
	env.verifyAllBoxes()
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e17VerificationHappy(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	env.receiveAll("ok")
	env.signOff()
	env.verifyAllBoxes()
	r := env.completeVerification()
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("completeVerification: %s", r.Error)
	}
	st := dataStr(r.Data, "status")
	if st != "putaway_pending" && st != "exception_pending" && st != "completed" {
		t.Fatalf("status=%q", st)
	}
	env.completePutawayForGRN(t)
}

func e2e18MissingBlocksVerification(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	env.receiveBox("C0001", "ok")
	env.signOff()
	env.verifyBoxFully("C0001")
	r := env.completeVerification()
	if r.Status == http.StatusOK && r.OK {
		t.Fatal("missing C0002 should block verification")
	}
	if !mustContain(r.Error, "review") || !mustContain(r.Error, "verification") {
		t.Fatalf("error=%q", r.Error)
	}
	env.partialClose()
	env.completePutawayForGRN(t)
}

func e2e19LateArrivalUnlocks(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	env.receiveBox("C0001", "ok")
	env.signOff()
	env.verifyBoxFully("C0001")
	r := env.scanBox("C0002", "")
	if dataStr(r.Data, "next_action") != "late_arrival" {
		t.Fatalf("next_action=%q", dataStr(r.Data, "next_action"))
	}
	env.confirmBox("C0002", "ok")
	env.verifyBoxFully("C0002")
	r = env.completeVerification()
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("completeVerification after late arrival: %s", r.Error)
	}
	env.completePutawayForGRN(t)
}

func e2e20AutoCompleteSingle(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 1}}}})
	r := env.post("/receiving/scan-box", map[string]interface{}{
		"session_id":            env.SessionID,
		"box_number":            "C0001",
		"auto_complete_single":  true,
		"default_route":         "INCOMING-01",
	})
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("auto complete scan: %s", r.Error)
	}
	if env.cartonStatus("C0001") != "verified" {
		t.Fatalf("status=%s want verified", env.cartonStatus("C0001"))
	}
	env.signOff()
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e21IncompleteMaster(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{
		CartonNo: "C0001",
		Lines:    []e2eLine{{ExpectedQty: 1, MasterIncomplete: true}},
	}})
	env.receiveBox("C0001", "ok")
	env.signOff()
	item := env.itemCodeInBox("C0001")
	r := env.scanItem("C0001", item)
	if r.Status == http.StatusOK && r.OK {
		t.Fatal("incomplete item master should block scan on ok box")
	}
	if r.Status != http.StatusConflict {
		t.Fatalf("status=%d want 409", r.Status)
	}
	env.assertNoPutawayWork(t)
}

func e2e22ClosedSessionScan(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 1}}}})
	env.receiveBox("C0001", "ok")
	env.signOff()
	env.verifyBoxFully("C0001")
	env.completeVerification()
	_, _ = env.pool.Exec(context.Background(), `UPDATE grn_sessions SET status='completed' WHERE id=$1`, env.SessionID)
	item := env.itemCodeInBox("C0001")
	r := env.scanItem("C0001", item)
	if r.Status == http.StatusOK && r.OK {
		t.Fatal("scan on completed session should fail")
	}
	env.completePutawayForGRN(t)
}

func e2e23ThreeBoxesSignoff(t *testing.T) {
	boxes := []e2eBox{
		{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 1}}},
		{CartonNo: "C0002", Lines: []e2eLine{{ExpectedQty: 1}}},
		{CartonNo: "C0003", Lines: []e2eLine{{ExpectedQty: 1}}},
	}
	env := newInboundE2E(t, boxes)
	for _, b := range boxes {
		env.receiveBox(b.CartonNo, "ok")
	}
	r := env.signOff()
	if dataFloat(r.Data, "missing") != 0 {
		t.Fatalf("missing=%v want 0", r.Data["missing"])
	}
	env.verifyAllBoxes()
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e24AlreadyVerified(t *testing.T) {
	env := newInboundE2E(t, []e2eBox{{CartonNo: "C0001", Lines: []e2eLine{{ExpectedQty: 1}}}})
	env.post("/receiving/scan-box", map[string]interface{}{
		"session_id":            env.SessionID,
		"box_number":            "C0001",
		"auto_complete_single":  true,
	})
	r := env.confirmBox("C0001", "ok")
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("confirm verified: %s", r.Error)
	}
	if dataStr(r.Data, "next_action") != "already_verified" {
		t.Fatalf("next_action=%q", dataStr(r.Data, "next_action"))
	}
	env.signOff()
	env.completeVerification()
	env.completePutawayForGRN(t)
}

func e2e25PartialClose(t *testing.T) {
	env := newInboundE2E(t, twoBoxFixture())
	env.receiveBox("C0001", "ok")
	env.receiveBox("C0002", "ok")
	env.signOff()
	item1 := env.itemCodeInBox("C0001")
	env.scanItemQty("C0001", item1, 1) // partial vs expected 2
	r := env.partialClose()
	if r.Status != http.StatusOK || !r.OK {
		t.Fatalf("partialClose: %s", r.Error)
	}
	if dataStr(r.Data, "status") != "partially_received" {
		t.Fatalf("status=%q want partially_received", dataStr(r.Data, "status"))
	}
	if env.sessionStatus() != "partially_received" {
		t.Fatalf("session=%s", env.sessionStatus())
	}
	if env.countExceptions("shortage") < 1 {
		t.Fatal("expected shortage recorded on partial close")
	}
	env.completePutawayForGRN(t)
}
