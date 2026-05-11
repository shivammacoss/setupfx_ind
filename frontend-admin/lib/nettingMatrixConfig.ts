// Mirror of bharat_indian_funded's nettingMatrixConfig.js — drives the netting
// segment matrix UI. Kept in sync manually with the backend NettingFieldsBase.

export type FieldType = "number" | "select" | "time";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: { v: string | boolean; l: string }[];
  optionOnly?: boolean;
  notForOption?: boolean;
  futureOnly?: boolean;
}

export interface CategoryDef {
  id: string;
  label: string;
}

export interface SegmentRow {
  code: string;
  name: string;
  lotApplies: boolean;
  qtyApplies: boolean;
  optionApplies: boolean;
  expiryHoldApplies: boolean;
  futureApplies: boolean;
}

export const SETTING_CATEGORIES: CategoryDef[] = [
  { id: "lot", label: "Lot" },
  { id: "quantity", label: "Quantity" },
  { id: "value", label: "Value" },
  { id: "fixedMargin", label: "Fixed Margin" },
  { id: "options", label: "Options" },
  { id: "brokerage", label: "Brokerage" },
  { id: "limitPoint", label: "Limit away" },
  { id: "spread", label: "Spread" },
  { id: "block", label: "Block" },
  { id: "expiryHold", label: "Expiry day" },
];

export const CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  lot: [
    { key: "minLots", label: "Min Lot", type: "number" },
    { key: "orderLots", label: "Per Order Lot", type: "number" },
    { key: "maxLots", label: "Max Lot/Script", type: "number" },
    { key: "maxExchangeLots", label: "Max Exchange Lots", type: "number" },
  ],
  quantity: [
    { key: "minQty", label: "Min Qty", type: "number" },
    { key: "perOrderQty", label: "Per Order Qty", type: "number" },
    { key: "maxQtyPerScript", label: "Max Qty/Script", type: "number" },
  ],
  value: [{ key: "maxValue", label: "Max margin value (₹)", type: "number" }],
  fixedMargin: [
    {
      key: "marginCalcMode",
      label: "Margin Mode",
      type: "select",
      options: [
        { v: "fixed", l: "Fixed" },
        { v: "times", l: "Times" },
        { v: "percent", l: "Percent" },
      ],
    },
    { key: "intradayMargin", label: "Intraday Margin", type: "number" },
    { key: "overnightMargin", label: "Overnight Margin", type: "number" },
    { key: "optionBuyIntraday", label: "Opt Buy Intraday", type: "number", optionOnly: true },
    { key: "optionBuyOvernight", label: "Opt Buy Overnight", type: "number", optionOnly: true },
    { key: "optionSellIntraday", label: "Opt Sell Intraday", type: "number", optionOnly: true },
    { key: "optionSellOvernight", label: "Opt Sell Overnight", type: "number", optionOnly: true },
  ],
  options: [
    { key: "buyingStrikeFarPercent", label: "Buy max % from underlying", type: "number", optionOnly: true },
    { key: "sellingStrikeFarPercent", label: "Sell max % from underlying", type: "number", optionOnly: true },
  ],
  brokerage: [
    {
      key: "commissionType",
      label: "Type",
      type: "select",
      options: [
        { v: "per_lot", l: "Per Lot" },
        { v: "per_crore", l: "Per Crore" },
      ],
    },
    { key: "commission", label: "Commission (₹)", type: "number", notForOption: true },
    { key: "optionBuyCommission", label: "Buy Brokerage (₹)", type: "number", optionOnly: true },
    { key: "optionSellCommission", label: "Sell Brokerage (₹)", type: "number", optionOnly: true },
    {
      key: "chargeOn",
      label: "Charge On",
      type: "select",
      options: [
        { v: "open", l: "Open" },
        { v: "close", l: "Close" },
        { v: "both", l: "Both" },
      ],
    },
  ],
  limitPoint: [{ key: "limitAwayPercent", label: "Max % away from market", type: "number" }],
  spread: [
    {
      key: "spreadType",
      label: "Spread Type",
      type: "select",
      options: [
        { v: "fixed", l: "Fixed" },
        { v: "floating", l: "Floating" },
      ],
    },
    { key: "spreadPips", label: "Spread (pips)", type: "number" },
    {
      key: "swapType",
      label: "Swap Type",
      type: "select",
      options: [
        { v: "points", l: "Points" },
        { v: "percentage", l: "Percentage" },
      ],
    },
    { key: "swapLong", label: "Swap Long", type: "number" },
    { key: "swapShort", label: "Swap Short", type: "number" },
    { key: "swapTime", label: "Swap Time (IST)", type: "time" },
  ],
  block: [
    {
      key: "isActive",
      label: "Is Active",
      type: "select",
      options: [
        { v: true, l: "Yes" },
        { v: false, l: "No" },
      ],
    },
    {
      key: "tradingEnabled",
      label: "Trading Enabled",
      type: "select",
      options: [
        { v: true, l: "Yes" },
        { v: false, l: "No" },
      ],
    },
    {
      key: "allowOvernight",
      label: "Allow Overnight",
      type: "select",
      options: [
        { v: true, l: "Yes" },
        { v: false, l: "No" },
      ],
    },
    { key: "maxMarginUsagePercent", label: "Max wallet usage (%)", type: "number" },
  ],
  expiryHold: [
    { key: "expiryProfitHoldMinSeconds", label: "Expiry profit hold (s)", type: "number" },
    { key: "expiryLossHoldMinSeconds", label: "Expiry loss hold (s)", type: "number" },
    { key: "expiryDayIntradayMargin", label: "Expiry day margin (futures)", type: "number", futureOnly: true },
    { key: "expiryDayOptionBuyMargin", label: "Expiry day OPT BUY margin", type: "number", optionOnly: true },
    { key: "expiryDayOptionSellMargin", label: "Expiry day OPT SELL margin", type: "number", optionOnly: true },
  ],
};

export function isFieldNA(segment: SegmentRow | undefined, categoryId: string, field: FieldDef): boolean {
  if (!segment) return true;
  if (field.optionOnly && !segment.optionApplies) return true;
  if (field.notForOption && segment.optionApplies) return true;
  if (field.futureOnly && !segment.futureApplies) return true;
  if (categoryId === "lot" && !segment.lotApplies) return true;
  if (categoryId === "quantity" && !segment.qtyApplies) return true;
  if (categoryId === "options" && !segment.optionApplies) return true;
  if (categoryId === "expiryHold" && !segment.expiryHoldApplies) return true;
  return false;
}
