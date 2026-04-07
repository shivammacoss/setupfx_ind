import React, { useEffect, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import useStore from '../../store/useStore';
import './OrderPanel.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const ORDER_TYPES = [
  { key: 'market',     label: 'Market' },
  { key: 'limit',      label: 'Limit' },
  { key: 'stop_limit', label: 'Stop Limit' },
  { key: 'buy_limit',  label: 'Buy Limit' },
];

const OrderPanel = () => {
  const selectedInstrument = useStore((s) => s.selectedInstrument);
  const orderType         = useStore((s) => s.orderType);
  const setOrderType      = useStore((s) => s.setOrderType);
  const orderSide         = useStore((s) => s.orderSide);
  const setOrderSide      = useStore((s) => s.setOrderSide);
  const volume            = useStore((s) => s.volume);
  const setVolume         = useStore((s) => s.setVolume);
  const leverage          = useStore((s) => s.leverage);
  const setOrderPanelOpen = useStore((s) => s.setOrderPanelOpen);
  const freeMargin        = useStore((s) => s.freeMargin);

  const [showTypeMenu, setShowTypeMenu]   = useState(false);
  const [session, setSession]             = useState('intraday'); // 'intraday' | 'carry'
  const [slValue, setSlValue]             = useState('');
  const [tpValue, setTpValue]             = useState('');
  const [charges, setCharges]             = useState(null);
  const [orderLoading, setOrderLoading]   = useState(false);
  const [orderResult, setOrderResult]     = useState(null);

  useEffect(() => {
    if (!selectedInstrument?.symbol) return;
    fetch(`${API_URL}/api/charges/${selectedInstrument.symbol}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setCharges(d); })
      .catch(() => {});
  }, [selectedInstrument?.symbol]);

  const leverageMultiplier = parseInt(leverage.split(':')[1]);
  const bid = selectedInstrument.bid || 0;
  const ask = selectedInstrument.ask || 0;
  const decimals = bid < 10 ? 5 : 2;
  const marginRequired = (volume * bid) / leverageMultiplier;

  const commissionAmount = charges?.commission
    ? charges.commission.type === 'per-lot'
      ? (charges.commission.open + charges.commission.close) * volume
      : charges.commission.open + charges.commission.close
    : 0;

  const handleVolumeChange = (delta) => {
    setVolume(Math.max(0.01, Math.round((volume + delta) * 100) / 100));
  };

  const selectedOrderType = ORDER_TYPES.find((t) => t.key === orderType) || ORDER_TYPES[0];

  const handleSubmitOrder = async () => {
    const userData = JSON.parse(localStorage.getItem('SetupFX-user') || '{}');
    const userId = userData.oderId || userData.userId;
    if (!userId) { alert('Please login to place trades'); return; }

    setOrderLoading(true);
    setOrderResult(null);
    try {
      const leverageVal = parseInt(leverage.split(':')[1]);
      const response = await fetch(`${API_URL}/api/trade/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          symbol: selectedInstrument.symbol,
          side: orderSide,
          volume,
          leverage: leverageVal,
          orderType,
          stopLoss: slValue ? parseFloat(slValue) : null,
          takeProfit: tpValue ? parseFloat(tpValue) : null,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setOrderResult({ type: 'success', message: `${orderSide.toUpperCase()} ${volume} lot @ ${data.position.entryPrice.toFixed(2)}` });
        if (data.wallet) {
          useStore.setState({
            balance: data.wallet.balance,
            equity: data.wallet.equity,
            margin: data.wallet.margin,
            freeMargin: data.wallet.freeMargin,
          });
        }
        setTimeout(() => setOrderResult(null), 3000);
      } else {
        const errMsg = data.details
          ? `${data.error}\nFree: $${data.details.freeMargin} | Req: $${(data.details.totalRequired ?? data.details.marginRequired ?? 0).toFixed(2)}`
          : data.error || 'Trade failed';
        setOrderResult({ type: 'error', message: errMsg });
        setTimeout(() => setOrderResult(null), 5000);
      }
    } catch (err) {
      setOrderResult({ type: 'error', message: 'Network error: ' + err.message });
      setTimeout(() => setOrderResult(null), 5000);
    } finally {
      setOrderLoading(false);
    }
  };

  return (
    <div className="op-panel">

      {/* ── Header ── */}
      <div className="op-header">
        <span className="op-symbol">{selectedInstrument.symbol}</span>
        <button className="op-close" onClick={() => setOrderPanelOpen(false)}><X size={14} /></button>
      </div>

      {/* ── STEP 1: BUY / SELL ── */}
      <div className="op-bs-row">
        <button
          className={`op-sell-btn${orderSide === 'sell' ? ' active' : ''}`}
          onClick={() => setOrderSide('sell')}
        >
          <span className="op-bs-tag">SELL</span>
          <span className="op-bs-price">{bid.toFixed(decimals)}</span>
        </button>
        <button
          className={`op-buy-btn${orderSide === 'buy' ? ' active' : ''}`}
          onClick={() => setOrderSide('buy')}
        >
          <span className="op-bs-tag">BUY</span>
          <span className="op-bs-price">{ask.toFixed(decimals)}</span>
        </button>
      </div>

      <div className="op-body">

        {/* ── STEP 2: Order Type Dropdown ── */}
        <div className="op-section">
          <div className="op-section-label">Order Type</div>
          <div className="op-dropdown-trigger" onClick={() => setShowTypeMenu(!showTypeMenu)}>
            <span>{selectedOrderType.label}</span>
            <ChevronDown size={14} className={`op-chevron${showTypeMenu ? ' open' : ''}`} />
          </div>
          {showTypeMenu && (
            <div className="op-dropdown-menu">
              {ORDER_TYPES.map((t) => (
                <button
                  key={t.key}
                  className={`op-dropdown-item${orderType === t.key ? ' active' : ''}`}
                  onClick={() => { setOrderType(t.key); setShowTypeMenu(false); }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── STEP 3: Lot / Quantity ── */}
        <div className="op-section">
          <div className="op-section-label">Lot Quantity</div>
          <div className="op-stepper">
            <button className="op-step-minus" onClick={() => handleVolumeChange(-0.01)}>−</button>
            <input
              className="op-step-val"
              type="number"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value) || 0.01)}
              step="0.01"
              min="0.01"
            />
            <button className="op-step-plus" onClick={() => handleVolumeChange(0.01)}>+</button>
          </div>
        </div>

        {/* ── STEP 4: Stop Loss ── */}
        <div className="op-section">
          <div className="op-sltp-label-row">
            <span className="op-sl-color">Stop Loss</span>
            <button className="op-sltp-toggle-btn" onClick={() => setSlValue(slValue ? '' : (bid * 0.999).toFixed(decimals))}>
              {slValue ? 'Remove' : '+ Add'}
            </button>
          </div>
          {slValue !== '' && (
            <input
              className="op-price-input"
              type="number"
              placeholder="SL Price"
              value={slValue}
              onChange={(e) => setSlValue(e.target.value)}
            />
          )}
        </div>

        {/* ── STEP 5: Take Profit ── */}
        <div className="op-section">
          <div className="op-sltp-label-row">
            <span className="op-tp-color">Take Profit</span>
            <button className="op-sltp-toggle-btn" onClick={() => setTpValue(tpValue ? '' : (ask * 1.001).toFixed(decimals))}>
              {tpValue ? 'Remove' : '+ Add'}
            </button>
          </div>
          {tpValue !== '' && (
            <input
              className="op-price-input"
              type="number"
              placeholder="TP Price"
              value={tpValue}
              onChange={(e) => setTpValue(e.target.value)}
            />
          )}
        </div>

        {/* ── STEP 6: Intraday / Carry Forward ── */}
        <div className="op-section">
          <div className="op-section-label">Session</div>
          <div className="op-session-toggle">
            <button
              className={`op-session-btn${session === 'intraday' ? ' active' : ''}`}
              onClick={() => setSession('intraday')}
            >
              Intraday
            </button>
            <button
              className={`op-session-btn${session === 'carry' ? ' active' : ''}`}
              onClick={() => setSession('carry')}
            >
              Carry Forward
            </button>
          </div>
        </div>

        {/* Order result toast */}
        {orderResult && (
          <div className={`op-result ${orderResult.type}`}>
            {orderResult.type === 'success' ? '✅ ' : '❌ '}{orderResult.message}
          </div>
        )}

        {/* ── STEP 7: Open Order Button ── */}
        <button
          className={`op-submit-btn ${orderSide}`}
          onClick={handleSubmitOrder}
          disabled={orderLoading}
        >
          {orderLoading ? 'Placing Order…' : `Open ${orderSide === 'buy' ? 'BUY' : 'SELL'} Order`}
        </button>

        {/* ── STEP 8: Bottom Info ── */}
        <div className="op-info-box">
          <div className="op-info-row">
            <span className="op-info-key">Session</span>
            <span className="op-info-chip">
              {session === 'intraday' ? 'Intraday (Auto SqOff)' : 'Carry Forward'}
            </span>
          </div>
          <div className="op-info-row">
            <span className="op-info-key">Margin Mode</span>
            <span className="op-info-val">Fixed — not set</span>
          </div>
          <div className="op-info-row">
            <span className="op-info-key">Required Margin</span>
            <span className="op-info-margin">₹{marginRequired.toFixed(2)}</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default OrderPanel;
