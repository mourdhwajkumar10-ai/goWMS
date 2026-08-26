package fulfillment

import "errors"

var (
	ErrWrongLocation    = errors.New("wrong location")
	ErrWrongItem        = errors.New("wrong item")
	ErrOverPick         = errors.New("over-pick")
	ErrLineNotPickable  = errors.New("line not pickable")
	ErrOverPack         = errors.New("over-pack")
	ErrNoPackingLoc     = errors.New("pick list has no packing location")
	ErrLegacyPickList   = errors.New("legacy pick list — use ConsumePickListStock")
	ErrInsufficientPack = errors.New("insufficient stock at packing location")
)
