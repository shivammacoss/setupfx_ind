import { useOutletContext } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { Pencil, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_URL } from '../userConfig';
import { netProfitInrIndianNettingClose } from '../../../utils/indianNettingTradeDisplay';

const HISTORY_PAGE_SIZE = 50;

function OrdersPage() {
  const {
    user,
    livePrices,
    zerodhaTicks,
    getTickBySymbolAuto,
    allInstruments,
    positions,
    pendingOrders,
    tradeHistory,
    cancelledOrders,
    usdInrRate,
    usdMarkup,
    displayCurrency,
    formatPrice,
    ordersActiveTab,
    setOrdersActiveTab,
    orderDateFrom,
    setOrderDateFrom,
    orderDateTo,
    setOrderDateTo,
    filterOrdersByDate,
    setSelectedPosition,
    setShowEditModal,
    setShowCloseModal,
    showEditModal,
    showCloseModal,
    selectedPosition,
    editSL,
    setEditSL,
    editTP,
    setEditTP,
    closeVolume,
    setCloseVolume,
    handleModifyPosition,
    handleClosePosition,
    getInstrumentWithLivePrice
  } = useOutletContext();

  const [historyPage, setHistoryPage] = useState(1);
  const [showLegsModal, setShowLegsModal] = useState(false);
  const [legsData, setLegsData] = useState([]);
  const [legsPosition, setLegsPosition] = useState(null);
  const [legsLoading, setLegsLoading] = useState(false);

  // Contract size calculation - same as MarketPage
  const getContractSize = (symbol) => {
    // Check if it's an Indian market instrument
    const inst = allInstruments?.find(i => i.symbol === symbol);
    if (inst?.category?.startsWith('nse_') || inst?.category?.startsWith('mcx_') || inst?.category?.startsWith('bse_')) {
      // For Indian markets, use lot size from instrument
      const ls = inst.lotSize || 1;
      return ls;
    }
    
    // Fallback for Indian instruments not in allInstruments
    // Check if symbol looks like Indian stock (no currency pairs)
    if (symbol && !symbol.includes('/') && 
        !symbol.includes('USD') && !symbol.includes('EUR') && 
        !symbol.includes('GBP') && !symbol.includes('JPY') &&
        !symbol.includes('AUD') && !symbol.includes('CAD') &&
        !symbol.includes('CHF') && !symbol.includes('NZD') &&
        !symbol.includes('BTC') && !symbol.includes('ETH') &&
        !symbol.includes('XAU') && !symbol.includes('XAG') &&
        symbol.length <= 20) {
      // Indian stock - default lot size is 1 for EQ
      return 1;
    }
    
    if (symbol?.includes('BTC')) return 1;
    if (symbol?.includes('ETH')) return 1;
    if (symbol?.includes('ADA')) return 1000;
    if (symbol === 'XAUUSD') return 100;
    if (symbol === 'XAGUSD') return 5000;
    if (symbol === 'XPTUSD') return 100;
    if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') return 1;
    if (symbol === 'BRENT' || symbol?.includes('OIL')) return 1000;
    return 100000;
  };

  // Helper to check if symbol is Indian instrument
  const isIndianInstrument = (sym) => {
    const inst = allInstruments?.find(i => i.symbol === sym);
    if (inst?.category?.startsWith('nse_') || inst?.category?.startsWith('mcx_') || inst?.category?.startsWith('bse_')) {
      return true;
    }
    return sym && !sym.includes('/') && 
      !sym.includes('USD') && !sym.includes('EUR') && 
      !sym.includes('GBP') && !sym.includes('JPY') && 
      !sym.includes('AUD') && !sym.includes('CAD') && 
      !sym.includes('CHF') && !sym.includes('NZD') &&
      !sym.includes('BTC') && !sym.includes('ETH') &&
      !sym.includes('XAU') && !sym.includes('XAG') &&
      sym.length <= 20;
  };

  const EXIT_SIDE_HINT =
    'Exit order: SELL = you closed a long; BUY = you closed a short. P/L uses your open direction, not this label alone.';

  const formatHistoryVolume = (trade) => {
    const v = Number(trade.volume);
    const ls = Number(trade.lotSize);
    if (!Number.isFinite(v)) return '—';
    const closedLike = trade.type === 'close' || trade.type === 'partial_close';
    if (trade.mode === 'netting' && isIndianInstrument(trade.symbol) && closedLike && Number.isFinite(ls) && ls > 1) {
      const q = Number(trade.quantity);
      const units = Number.isFinite(q) && q > 0 ? Math.round(q) : Math.round(v * ls);
      return `${v} × ${ls} (${units})`;
    }
    if (trade.mode === 'netting' && isIndianInstrument(trade.symbol) && closedLike) {
      return `${v} lot${v === 1 ? '' : 's'}`;
    }
    return String(v);
  };

  /** Same as MarketPage — one source of truth for Indian vs FX P/L units */
  const isIndianPositionPnl = (pos) => {
    const sym = pos?.symbol || '';
    const posExchange = (pos?.exchange || '').toUpperCase();
    return posExchange === 'NSE' || posExchange === 'BSE' || posExchange === 'NFO' ||
      posExchange === 'BFO' || posExchange === 'MCX' ||
      sym.includes('NIFTY') || sym.includes('BANKNIFTY') || sym.includes('SENSEX') ||
      sym.includes('FINNIFTY') || sym.endsWith('CE') || sym.endsWith('PE') ||
      (!sym.includes('/') && !sym.includes('USD') && !sym.includes('EUR') &&
       !sym.includes('GBP') && !sym.includes('JPY') && !sym.includes('AUD') &&
       !sym.includes('CAD') && !sym.includes('CHF') && !sym.includes('NZD') &&
       !sym.includes('BTC') && !sym.includes('ETH') && !sym.includes('XAU') &&
       !sym.includes('XAG') && !sym.includes('US30') && !sym.includes('US100') &&
       !sym.includes('US500') && !sym.includes('UK100'));
  };

  // Current price: spread-aware via getInstrumentWithLivePrice (same as MarketPage), then Meta/Zerodha, then server mid, then entry
  const getPositionCurrentPrice = (pos) => {
    const staticInst = allInstruments?.find(i => i.symbol === pos.symbol);
    if (staticInst && typeof getInstrumentWithLivePrice === 'function') {
      const inst = getInstrumentWithLivePrice(staticInst);
      if (inst && (inst.bid > 0 || inst.ask > 0)) {
        return pos.side === 'buy' ? inst.bid : inst.ask;
      }
    }
    let livePrice = livePrices?.[pos.symbol];
    let hasLivePrice = livePrice && (livePrice.bid > 0 || livePrice.ask > 0);
    if (!hasLivePrice && getTickBySymbolAuto) {
      const zerodhaTick = getTickBySymbolAuto(pos.symbol);
      const zLp = zerodhaTick?.lastPrice || zerodhaTick?.last_price || 0;
      if (zerodhaTick && zLp > 0) {
        livePrice = { bid: zerodhaTick.bid || zLp, ask: zerodhaTick.ask || zLp };
        hasLivePrice = true;
      }
    }
    if (hasLivePrice) {
      return pos.side === 'buy' ? livePrice.bid : livePrice.ask;
    }
    const cp = Number(pos.currentPrice);
    if (Number.isFinite(cp) && cp > 0) return cp;
    return pos.entryPrice || pos.avgPrice || 0;
  };

  // Calculate positions with live prices - recalculates when prices change
  const positionsWithPrices = useMemo(() => {
    return positions.map(pos => {
      const currentPrice = getPositionCurrentPrice(pos);
      const entryPrice = pos.entryPrice || pos.avgPrice || 0;
      const priceDiff = pos.side === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
      const sym = pos.symbol || '';

      let profit = 0;
      if (isIndianPositionPnl(pos)) {
        const quantity = pos.quantity || (pos.volume * (pos.lotSize || 1)) || 0;
        profit = priceDiff * quantity;
      } else {
        const vol = pos.volume || 0;
        if (sym.includes('JPY')) {
          profit = (priceDiff * 100000 * vol) / 100;
        } else {
          profit = priceDiff * getContractSize(sym) * vol;
        }
      }

      return { ...pos, currentPrice, profit, entryPrice };
    });
  }, [positions, livePrices, zerodhaTicks, getTickBySymbolAuto, allInstruments, getInstrumentWithLivePrice]);

  const filteredOpenPositions = useMemo(
    () => filterOrdersByDate(positionsWithPrices),
    [positionsWithPrices, filterOrdersByDate, orderDateFrom, orderDateTo]
  );

  /** Total open floating P/L in the selected display currency (sum of row values — no wrong first-symbol format). */
  const openTotalInDisplayCurrency = useMemo(() => {
    const rate = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);
    let sum = 0;
    for (const p of filteredOpenPositions) {
      if (p.status === 'closed') continue;
      if (p.mode === 'binary') continue;
      const raw = Number(p.profit) || 0;
      if (isIndianPositionPnl(p)) {
        sum += displayCurrency === 'INR' ? raw : raw / rate;
      } else {
        sum += displayCurrency === 'INR' ? raw * rate : raw;
      }
    }
    return sum;
  }, [filteredOpenPositions, displayCurrency, usdInrRate, usdMarkup]);

  // Get current price for a position (for pending orders)
  const getCurrentPrice = (pos) => {
    let livePrice = livePrices?.[pos.symbol];
    let hasLivePrice = livePrice && (livePrice.bid > 0 || livePrice.ask > 0);
    
    if (!hasLivePrice && getTickBySymbolAuto) {
      const zerodhaTick = getTickBySymbolAuto(pos.symbol);
      const zLp = zerodhaTick?.lastPrice || zerodhaTick?.last_price || 0;
      if (zerodhaTick && zLp > 0) {
        livePrice = { bid: zerodhaTick.bid || zLp, ask: zerodhaTick.ask || zLp };
        hasLivePrice = true;
      }
    }

    if (!hasLivePrice) return pos.entryPrice;
    return pos.side === 'buy' ? livePrice.bid : livePrice.ask;
  };

  // Format P/L — match MarketPage (displayCurrency + correct INR/USD branch per instrument)
  // Optional `isIndianOverride` aligns with isIndianPositionPnl when symbol-based detection differs (e.g. exchange on position).
  const formatPnL = (profit, symbol = '', isIndianOverride) => {
    const sign = profit >= 0 ? '+' : '-';
    const rate = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);
    const indian = typeof isIndianOverride === 'boolean'
      ? isIndianOverride
      : (symbol ? isIndianInstrument(symbol) : false);

    if (indian) {
      if (displayCurrency === 'USD') {
        return `${sign}$${Math.abs(profit / rate).toFixed(2)}`;
      }
      return `${sign}₹${Math.abs(profit).toFixed(2)}`;
    }

    if (displayCurrency === 'INR') {
      return `${sign}₹${Math.abs(profit * rate).toFixed(2)}`;
    }
    return `${sign}$${Math.abs(profit).toFixed(2)}`;
  };

  const formatDisplayAmount = (amount) => {
    const sign = amount >= 0 ? '+' : '-';
    return `${sign}${displayCurrency === 'INR' ? '₹' : '$'}${Math.abs(amount).toFixed(2)}`;
  };

  /** Open fee: netting/hedging store open leg in openCommission; commission may hold running total */
  const getOpenPositionCommission = (pos) => {
    const open = Number(pos?.openCommission);
    const total = Number(pos?.commission);
    if (Number.isFinite(open) && open > 0) return open;
    if (Number.isFinite(total) && total > 0) return total;
    return 0;
  };

  /** Get the original INR commission (avoids rate fluctuation) */
  const getOpenPositionCommissionInr = (pos) => {
    const openInr = Number(pos?.openCommissionInr);
    if (Number.isFinite(openInr) && openInr > 0) return openInr;
    return 0;
  };

  /** `amount` = commission stored in USD (wallet). `inrAmount` = commissionInr from server when set. */
  const formatCommission = (amountUsd, symbol = '', inrAmount = 0) => {
    const usd = Number(amountUsd) || 0;
    const inr = Number(inrAmount) || 0;
    const rate = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);
    if (usd === 0 && inr === 0) {
      return displayCurrency === 'INR' ? '₹0.00' : '$0.00';
    }
    if (displayCurrency === 'INR') {
      const showInr = inr > 0 ? inr : usd * rate;
      return `₹${showInr.toFixed(2)}`;
    }
    const showUsd = inr > 0 ? inr / rate : usd;
    return `$${showUsd.toFixed(2)}`;
  };

  const filteredTradeHistory = useMemo(
    () => filterOrdersByDate(tradeHistory),
    [tradeHistory, orderDateFrom, orderDateTo, filterOrdersByDate]
  );

  const effectiveFxRate = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);

  /** Stored `profit` can be wrong on legacy Indian closes; reconcile from prices + commission + swap. */
  const historyRowProfitRaw = (t) => {
    const reconciled = netProfitInrIndianNettingClose(t, effectiveFxRate);
    if (reconciled != null) return reconciled;
    return Number(t.profit) || 0;
  };

  /** Sum history in INR-equivalent for footer (Indian = INR; other = USD × rate). */
  const historyTotalRealizedPnLInr = useMemo(
    () =>
      filteredTradeHistory.reduce((sum, t) => {
        const r = netProfitInrIndianNettingClose(t, effectiveFxRate);
        if (r != null) return sum + r;
        const p = Number(t.profit) || 0;
        if (isIndianInstrument(t.symbol)) return sum + p;
        return sum + p * effectiveFxRate;
      }, 0),
    [filteredTradeHistory, effectiveFxRate, isIndianInstrument]
  );

  const historyPageCount = Math.max(1, Math.ceil(filteredTradeHistory.length / HISTORY_PAGE_SIZE));

  useEffect(() => {
    setHistoryPage((pg) => Math.min(Math.max(1, pg), historyPageCount));
  }, [historyPageCount, filteredTradeHistory.length]);

  useEffect(() => {
    setHistoryPage(1);
  }, [orderDateFrom, orderDateTo]);

  const paginatedTradeHistory = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return filteredTradeHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredTradeHistory, historyPage]);

  const historyRangeStart = filteredTradeHistory.length === 0 ? 0 : (historyPage - 1) * HISTORY_PAGE_SIZE + 1;
  const historyRangeEnd = filteredTradeHistory.length === 0
    ? 0
    : Math.min(historyPage * HISTORY_PAGE_SIZE, filteredTradeHistory.length);

  // Fetch individual netting legs for a position
  const fetchNettingLegs = async (pos) => {
    if (pos.mode !== 'netting') return;
    setLegsPosition(pos);
    setShowLegsModal(true);
    setLegsLoading(true);
    try {
      const userId = user?.id || 'guest';
      const orderId = pos.oderId || pos.tradeId || pos._id;
      const response = await fetch(`${API_URL}/api/trades/legs/${userId}/${orderId}`);
      const data = await response.json();
      setLegsData(data.legs || []);
    } catch (error) {
      console.error('Error fetching netting legs:', error);
      setLegsData([]);
    } finally {
      setLegsLoading(false);
    }
  };

  return (
    <div className="page-content orders-page">
      <div className="orders-header">
        <div>
          <h2>Orders</h2>
          <p className="subtitle" style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-muted)' }}>Manage your positions & history</p>
        </div>
        <div className="orders-filters">
          <div className="date-filter">
            <label>From</label>
            <input type="date" value={orderDateFrom} onChange={(e) => setOrderDateFrom(e.target.value)} />
          </div>
          <div className="date-filter">
            <label>To</label>
            <input type="date" value={orderDateTo} onChange={(e) => setOrderDateTo(e.target.value)} />
          </div>
          <button className="filter-btn ios-btn-secondary" onClick={() => { setOrderDateFrom(''); setOrderDateTo(''); }}>Clear</button>
        </div>
      </div>

      <div className="orders-tabs">
        <button className={`orders-tab ${ordersActiveTab === 'open' ? 'active' : ''}`} onClick={() => setOrdersActiveTab('open')}>Open ({positions.length})</button>
        <button className={`orders-tab ${ordersActiveTab === 'pending' ? 'active' : ''}`} onClick={() => setOrdersActiveTab('pending')}>Pending ({pendingOrders.length})</button>
        <button className={`orders-tab ${ordersActiveTab === 'closed' ? 'active' : ''}`} onClick={() => setOrdersActiveTab('closed')}>History ({filteredTradeHistory.length})</button>
        <button className={`orders-tab ${ordersActiveTab === 'cancelled' ? 'active' : ''}`} onClick={() => setOrdersActiveTab('cancelled')}>Cancelled ({cancelledOrders.length})</button>
      </div>

      {/* Open Positions */}
      {ordersActiveTab === 'open' && (
        <div className="orders-section">
          <div className="section-header">
            <h3>Open Positions</h3>
            <div className="section-summary">
              <span className={`total-pnl ${openTotalInDisplayCurrency >= 0 ? 'profit' : 'loss'}`}>
                Total P/L: {formatDisplayAmount(openTotalInDisplayCurrency)}
              </span>
            </div>
          </div>
          
          {/* Mobile Card View */}
          <div className="orders-cards-mobile">
            {positionsWithPrices.length === 0 ? (
              <div className="no-data-card">No open positions</div>
            ) : (
              filteredOpenPositions.map((pos) => (
                <div key={pos.tradeId || pos._id} className="order-card" onClick={() => fetchNettingLegs(pos)} style={{ cursor: pos.mode === 'netting' ? 'pointer' : 'default' }}>
                  <div className="order-card-header">
                    <span className={`order-side ${pos.side}`}>{(pos.side || 'BUY').toUpperCase()}</span>
                    <span className="order-symbol">{pos.symbol}</span>
                    <span className="order-volume">{pos.volume || 0} lots</span>
                  </div>
                  <div className="order-card-body">
                    <div className="order-row">
                      <span className="order-label">Entry</span>
                      <span className="order-value">{formatPrice(pos.entryPrice, pos.symbol, true)}</span>
                    </div>
                    <div className="order-row">
                      <span className="order-label">Current</span>
                      <span className="order-value">{formatPrice(pos.currentPrice, pos.symbol, true)}</span>
                    </div>
                    <div className="order-row">
                      <span className="order-label">Commission</span>
                      <span className="order-value">{formatCommission(getOpenPositionCommission(pos), pos.symbol, getOpenPositionCommissionInr(pos))}</span>
                    </div>
                    <div className="order-row">
                      <span className="order-label">Swap</span>
                      <span className="order-value">{formatCommission(Number(pos.swap) || 0, pos.symbol)}</span>
                    </div>
                    <div className="order-row">
                      <span className="order-label">P/L</span>
                      <span className={`order-value pnl ${pos.profit >= 0 ? 'profit' : 'loss'}`}>{formatPnL(pos.profit, pos.symbol, isIndianPositionPnl(pos))}</span>
                    </div>
                  </div>
                  <div className="order-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="card-action-btn edit" onClick={(e) => { e.stopPropagation(); setSelectedPosition(pos); setShowEditModal(true); }}>Edit S/L T/P</button>
                    <button className="card-action-btn close" onClick={(e) => { e.stopPropagation(); setSelectedPosition(pos); setShowCloseModal(true); }}>Close</button>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {/* Desktop Table View */}
          <div className="orders-table-container desktop-only">
            <table className="orders-table">
              <thead>
                <tr><th>ID</th><th>Open Time</th><th>Symbol</th><th>Type</th><th>Volume</th><th>Entry</th><th>Current</th><th>S/L</th><th>T/P</th><th>Commission</th><th>Swap</th><th>P/L</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {positionsWithPrices.length === 0 ? (
                  <tr><td colSpan="13" className="no-data">No open positions</td></tr>
                ) : (
                  filteredOpenPositions.map((pos) => (
                      <tr key={pos.tradeId || pos._id} onClick={() => fetchNettingLegs(pos)} style={{ cursor: pos.mode === 'netting' ? 'pointer' : 'default' }} title={pos.mode === 'netting' ? 'Click to view entry legs' : ''}>
                        <td className="order-id">{(pos.tradeId || pos._id || '').slice(-6)}</td>
                        <td>{new Date(pos.openTime || pos.createdAt).toLocaleString()}</td>
                        <td className="symbol-cell">{pos.symbol}</td>
                        <td className={`side-cell ${pos.side}`}>{pos.side?.toUpperCase()}</td>
                        <td>{pos.volume}</td>
                        <td>{formatPrice(pos.entryPrice, pos.symbol, true)}</td>
                        <td>{formatPrice(pos.currentPrice, pos.symbol, true)}</td>
                        <td className="sl-cell">{pos.stopLoss || '-'}</td>
                        <td className="tp-cell">{pos.takeProfit || '-'}</td>
                        <td className="commission-cell">{formatCommission(getOpenPositionCommission(pos), pos.symbol, getOpenPositionCommissionInr(pos))}</td>
                        <td className="swap-cell">{formatCommission(Number(pos.swap) || 0, pos.symbol)}</td>
                        <td className={`pnl-cell ${pos.profit >= 0 ? 'profit' : 'loss'}`}>{formatPnL(pos.profit, pos.symbol, isIndianPositionPnl(pos))}</td>
                        <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                          <button className="action-btn edit-btn" onClick={(e) => { e.stopPropagation(); setSelectedPosition(pos); setShowEditModal(true); }} title="Edit S/L T/P"><Pencil size={13} /></button>
                          <button className="action-btn close-btn" onClick={(e) => { e.stopPropagation(); setSelectedPosition(pos); setShowCloseModal(true); }} title="Close Position"><X size={13} /></button>
                        </td>
                      </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Orders */}
      {ordersActiveTab === 'pending' && (
        <div className="orders-section">
          <div className="section-header"><h3>Pending Orders</h3></div>
          
          {/* Mobile Card View */}
          <div className="orders-cards-mobile">
            {pendingOrders.length === 0 ? (
              <div className="no-data-card">No pending orders</div>
            ) : (
              filterOrdersByDate(pendingOrders).map((order) => (
                <div key={order.tradeId || order._id} className="order-card">
                  <div className="order-card-header">
                    <span className={`order-side ${order.side}`}>{(order.orderType || 'LIMIT').toUpperCase()}</span>
                    <span className="order-symbol">{order.symbol}</span>
                    <span className="order-volume">{order.volume || 0} lots</span>
                  </div>
                  <div className="order-card-body">
                    <div className="order-row">
                      <span className="order-label">Entry Price</span>
                      <span className="order-value">{formatPrice(order.entryPrice, order.symbol, true)}</span>
                    </div>
                    <div className="order-row">
                      <span className="order-label">Current</span>
                      <span className="order-value">{formatPrice(getCurrentPrice(order), order.symbol, true)}</span>
                    </div>
                  </div>
                  <div className="order-card-actions">
                    <button className="card-action-btn cancel">Cancel Order</button>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {/* Desktop Table View */}
          <div className="orders-table-container desktop-only">
            <table className="orders-table">
              <thead>
                <tr><th>ID</th><th>Created</th><th>Symbol</th><th>Type</th><th>Volume</th><th>Entry</th><th>Current</th><th>S/L</th><th>T/P</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {pendingOrders.length === 0 ? (
                  <tr><td colSpan="10" className="no-data">No pending orders</td></tr>
                ) : (
                  filterOrdersByDate(pendingOrders).map((order) => (
                    <tr key={order.tradeId || order._id}>
                      <td className="order-id">{(order.tradeId || order._id || '').slice(-6)}</td>
                      <td>{new Date(order.createdAt).toLocaleString()}</td>
                      <td className="symbol-cell">{order.symbol}</td>
                      <td className={`side-cell ${order.side}`}>{order.orderType?.toUpperCase()} {order.side?.toUpperCase()}</td>
                      <td>{order.volume}</td>
                      <td>{formatPrice(order.entryPrice, order.symbol, true)}</td>
                      <td>{formatPrice(getCurrentPrice(order), order.symbol, true)}</td>
                      <td className="sl-cell">{order.stopLoss || '-'}</td>
                      <td className="tp-cell">{order.takeProfit || '-'}</td>
                      <td className="actions-cell"><button className="action-btn cancel-btn">Cancel</button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trade History — pagination sits outside .orders-section (section uses overflow:hidden) */}
      {ordersActiveTab === 'closed' && (
        <>
        <div className="orders-section orders-section--history">
          <div className="section-header">
            <h3>Trade History</h3>
            <div className="section-summary">
              <span className={`total-pnl ${historyTotalRealizedPnLInr >= 0 ? 'profit' : 'loss'}`}>
                Total Realized P/L:{' '}
                {displayCurrency === 'INR'
                  ? `${historyTotalRealizedPnLInr >= 0 ? '+' : '-'}₹${Math.abs(historyTotalRealizedPnLInr).toFixed(2)}`
                  : `${historyTotalRealizedPnLInr >= 0 ? '+' : '-'}$${(Math.abs(historyTotalRealizedPnLInr) / effectiveFxRate).toFixed(2)}`}
              </span>
            </div>
          </div>

          <div className="orders-history-list-wrap">
          <div className="orders-cards-mobile">
            {filteredTradeHistory.length === 0 ? (
              <div className="no-data-card">No trade history</div>
            ) : (
              paginatedTradeHistory.map((trade) => (
                <div key={trade.tradeId || trade._id} className="order-card history">
                  <div className="order-card-header">
                    <span className={`order-side ${trade.side}`} title={(trade.mode === 'netting' && (trade.type === 'close' || trade.type === 'partial_close')) ? EXIT_SIDE_HINT : undefined}>{(trade.side || 'BUY').toUpperCase()}</span>
                    <span className="order-symbol">{trade.symbol}</span>
                    <span className="order-volume">{formatHistoryVolume(trade)}</span>
                  </div>
                  <div className="order-card-body">
                    <div className="order-row">
                      <span className="order-label">Entry</span>
                      <span className="order-value">{formatPrice(trade.entryPrice, trade.symbol, true)}</span>
                    </div>
                    <div className="order-row">
                      <span className="order-label">Close</span>
                      <span className="order-value">{formatPrice(trade.closePrice || trade.entryPrice, trade.symbol, true)}</span>
                    </div>
                    <div className="order-row">
                      <span className="order-label">Commission</span>
                      <span className="order-value">{formatCommission(Number(trade.commission) || 0, trade.symbol, Number(trade.commissionInr) || 0)}</span>
                    </div>
                    <div className="order-row">
                      <span className="order-label">Swap</span>
                      <span className="order-value">{formatCommission(Number(trade.swap) || 0, trade.symbol)}</span>
                    </div>
                    <div className="order-row">
                      <span className="order-label">P/L</span>
                      <span className={`order-value pnl ${historyRowProfitRaw(trade) >= 0 ? 'profit' : 'loss'}`}>
                        {formatPnL(historyRowProfitRaw(trade), trade.symbol, isIndianInstrument(trade.symbol))}
                      </span>
                    </div>
                    <div className="order-row">
                      <span className="order-label">Remark</span>
                      <span className="order-value" style={{ color: trade.remark === 'SL' ? '#ef4444' : trade.remark === 'TP' ? '#10b981' : trade.remark === 'Stop Out' ? '#dc2626' : '#9ca3af' }}>{trade.remark || trade.closedBy || '—'}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="orders-table-container desktop-only">
            <table className="orders-table">
              <thead>
                <tr><th>ID</th><th>Open Time</th><th>Close Time</th><th>Symbol</th><th title={EXIT_SIDE_HINT}>Exit</th><th>Volume</th><th>Entry</th><th>Close</th><th>Commission</th><th>Swap</th><th>P/L</th><th>Remark</th></tr>
              </thead>
              <tbody>
                {filteredTradeHistory.length === 0 ? (
                  <tr><td colSpan="12" className="no-data">No trade history</td></tr>
                ) : (
                  paginatedTradeHistory.map((trade) => (
                    <tr key={trade.tradeId || trade._id}>
                      <td className="order-id">{(trade.tradeId || trade._id || '').slice(-6)}</td>
                      <td>{new Date(trade.executedAt || trade.openTime || trade.createdAt).toLocaleString()}</td>
                      <td>{(trade.closedAt || trade.closeTime) ? new Date(trade.closedAt || trade.closeTime).toLocaleString() : '-'}</td>
                      <td className="symbol-cell">{trade.symbol}</td>
                      <td className={`side-cell ${trade.side}`} title={(trade.mode === 'netting' && (trade.type === 'close' || trade.type === 'partial_close')) ? EXIT_SIDE_HINT : undefined}>{trade.side?.toUpperCase()}</td>
                      <td>{formatHistoryVolume(trade)}</td>
                      <td>{formatPrice(trade.entryPrice, trade.symbol, true)}</td>
                      <td>{formatPrice(trade.closePrice || trade.entryPrice, trade.symbol, true)}</td>
                      <td className="commission-cell">{formatCommission(Number(trade.commission) || 0, trade.symbol, Number(trade.commissionInr) || 0)}</td>
                      <td className="swap-cell">{formatCommission(Number(trade.swap) || 0, trade.symbol)}</td>
                      <td className={`pnl-cell ${historyRowProfitRaw(trade) >= 0 ? 'profit' : 'loss'}`}>
                        {formatPnL(historyRowProfitRaw(trade), trade.symbol, isIndianInstrument(trade.symbol))}
                      </td>
                      <td style={{ fontSize: '12px', color: trade.remark === 'SL' ? '#ef4444' : trade.remark === 'TP' ? '#10b981' : trade.remark === 'Stop Out' ? '#dc2626' : '#9ca3af' }}>{trade.remark || trade.closedBy || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>

        {filteredTradeHistory.length > 0 && (
          <div
            className="orders-pagination orders-pagination--history"
            role="navigation"
            aria-label="Trade history pages"
          >
            <span className="orders-pagination-range">
              {historyRangeStart}–{historyRangeEnd} of {filteredTradeHistory.length}
            </span>
            <div className="orders-pagination-actions">
              <button
                type="button"
                className="orders-pagination-btn ios-btn-secondary"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="orders-pagination-page">
                {historyPage} / {historyPageCount}
              </span>
              <button
                type="button"
                className="orders-pagination-btn ios-btn-secondary"
                disabled={historyPage >= historyPageCount}
                onClick={() => setHistoryPage((p) => Math.min(historyPageCount, p + 1))}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Cancelled Orders */}
      {ordersActiveTab === 'cancelled' && (
        <div className="orders-section">
          <div className="section-header"><h3>Cancelled Orders</h3></div>
          <div className="orders-table-container">
            <table className="orders-table">
              <thead>
                <tr><th>ID</th><th>Created</th><th>Cancelled</th><th>Symbol</th><th>Type</th><th>Volume</th><th>Entry</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {cancelledOrders.length === 0 ? (
                  <tr><td colSpan="8" className="no-data">No cancelled orders</td></tr>
                ) : (
                  filterOrdersByDate(cancelledOrders).map((order) => (
                    <tr key={order.tradeId || order._id}>
                      <td className="order-id">{(order.tradeId || order._id || '').slice(-6)}</td>
                      <td>{new Date(order.createdAt).toLocaleString()}</td>
                      <td>{order.cancelledAt ? new Date(order.cancelledAt).toLocaleString() : '-'}</td>
                      <td className="symbol-cell">{order.symbol}</td>
                      <td className={`side-cell ${order.side}`}>{order.orderType?.toUpperCase()} {order.side?.toUpperCase()}</td>
                      <td>{order.volume}</td>
                      <td>{formatPrice(order.entryPrice, order.symbol, true)}</td>
                      <td>{order.cancelReason || 'User cancelled'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedPosition && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ Modify Position</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="position-info">
                <span className={`side-badge ${selectedPosition.side}`}>{selectedPosition.side?.toUpperCase()}</span>
                <span className="symbol">{selectedPosition.symbol}</span>
                <span className="volume">{selectedPosition.volume} lots</span>
              </div>
              <div className="modal-input-group">
                <label>Stop Loss</label>
                <input type="number" step="0.00001" value={editSL} onChange={(e) => setEditSL(e.target.value)} placeholder="Enter stop loss price" />
              </div>
              <div className="modal-input-group">
                <label>Take Profit</label>
                <input type="number" step="0.00001" value={editTP} onChange={(e) => setEditTP(e.target.value)} placeholder="Enter take profit price" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="modal-btn confirm" onClick={handleModifyPosition}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Close Modal */}
      {showCloseModal && selectedPosition && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal-content close-modal-pro" onClick={e => e.stopPropagation()}>
            <div className="close-modal-header">
              <div className="close-position-badge">
                <span className={`side-indicator ${selectedPosition.side}`}>{selectedPosition.side?.toUpperCase()}</span>
                <span className="close-symbol">{selectedPosition.symbol}</span>
                <span className="close-volume">{selectedPosition.volume} lots</span>
              </div>
              <button className="modal-close" onClick={() => setShowCloseModal(false)}>×</button>
            </div>
            <div className="close-modal-body">
              <div className="close-actions-row">
                <button className="close-action-btn primary" onClick={() => handleClosePosition(selectedPosition, selectedPosition.volume)}>Close Position</button>
              </div>
              <div className="partial-section">
                <div className="partial-header">Partial Close</div>
                <div className="partial-input-row">
                  <input type="number" step="0.01" min="0.01" max={selectedPosition.volume} value={closeVolume} onChange={(e) => setCloseVolume(e.target.value)} placeholder="Volume" />
                  <button className="partial-close-btn" onClick={() => handleClosePosition(selectedPosition, parseFloat(closeVolume))}>Close</button>
                </div>
                <div className="partial-presets">
                  <button onClick={() => setCloseVolume((selectedPosition.volume * 0.25).toFixed(2))}>25%</button>
                  <button onClick={() => setCloseVolume((selectedPosition.volume * 0.5).toFixed(2))}>50%</button>
                  <button onClick={() => setCloseVolume((selectedPosition.volume * 0.75).toFixed(2))}>75%</button>
                  <button className="active" onClick={() => setCloseVolume(selectedPosition.volume)}>100%</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Netting Legs Modal */}
      {showLegsModal && legsPosition && (
        <div className="modal-overlay" onClick={() => setShowLegsModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', width: '95%' }}>
            <div className="modal-header">
              <h3>📊 Netting Entries — {legsPosition.symbol}</h3>
              <button className="modal-close" onClick={() => setShowLegsModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '0' }}>
              {/* Position Summary */}
              <div style={{ padding: '16px 20px', background: 'var(--card-bg, #1a1a2e)', borderBottom: '1px solid var(--border-color, #333)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #888)' }}>Side</span>
                    <div style={{ fontWeight: 'bold', color: legsPosition.side === 'buy' ? '#10b981' : '#ef4444' }}>{legsPosition.side?.toUpperCase()}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #888)' }}>Total Volume</span>
                    <div style={{ fontWeight: 'bold', color: '#fff' }}>{parseFloat(Number(legsPosition.volume).toFixed(4))}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #888)' }}>Avg Entry</span>
                    <div style={{ fontWeight: 'bold', color: '#fff' }}>{formatPrice(legsPosition.entryPrice, legsPosition.symbol, true)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #888)' }}>Current</span>
                    <div style={{ fontWeight: 'bold', color: '#fff' }}>{formatPrice(legsPosition.currentPrice, legsPosition.symbol, true)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #888)' }}>Total P/L</span>
                    <div style={{ fontWeight: 'bold', color: legsPosition.profit >= 0 ? '#10b981' : '#ef4444' }}>{formatPnL(legsPosition.profit, legsPosition.symbol)}</div>
                  </div>
                </div>
              </div>

              {/* Legs Table */}
              <div style={{ overflowX: 'auto', padding: '0' }}>
                {legsLoading ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted, #888)' }}>Loading entry legs...</div>
                ) : legsData.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted, #888)' }}>No individual entry legs found (single entry position)</div>
                ) : (
                  <table className="orders-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Type</th>
                        <th>Side</th>
                        <th>Time</th>
                        <th>Volume</th>
                        <th>Price</th>
                        <th>P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legsData.map((leg, idx) => {
                        const isPartialClose = leg.type === 'partial_close';
                        const legSide = isPartialClose
                          ? (leg.side || (legsPosition.side === 'buy' ? 'sell' : 'buy'))
                          : (leg.side || legsPosition.side);
                        const ep = isPartialClose ? (leg.closePrice || leg.entryPrice || 0) : (leg.entryPrice || 0);
                        const vol = parseFloat(Number(leg.volume || 0).toFixed(4));
                        const sym = leg.symbol || '';

                        // For partial close, P/L is already calculated and stored
                        let pnl = 0;
                        if (isPartialClose) {
                          pnl = leg.profit || 0;
                        } else {
                          const cp = legsPosition.currentPrice || legsPosition.entryPrice;
                          const priceDiff = legsPosition.side === 'buy' ? (cp - ep) : (ep - cp);
                          const posExchange = (legsPosition.exchange || '').toUpperCase();
                          const isIndian = posExchange === 'NSE' || posExchange === 'BSE' || posExchange === 'NFO' ||
                            posExchange === 'BFO' || posExchange === 'MCX' ||
                            sym.includes('NIFTY') || sym.includes('BANKNIFTY') || sym.includes('SENSEX') ||
                            sym.includes('FINNIFTY') || sym.endsWith('CE') || sym.endsWith('PE') ||
                            (!sym.includes('/') && !sym.includes('USD') && !sym.includes('EUR') &&
                             !sym.includes('GBP') && !sym.includes('JPY') && !sym.includes('AUD') &&
                             !sym.includes('CAD') && !sym.includes('CHF') && !sym.includes('NZD') &&
                             !sym.includes('BTC') && !sym.includes('ETH') && !sym.includes('XAU') &&
                             !sym.includes('XAG') && !sym.includes('US30') && !sym.includes('US100') &&
                             !sym.includes('US500') && !sym.includes('UK100'));
                          if (isIndian) {
                            const quantity = (leg.volume || 0) * (legsPosition.lotSize || 1);
                            pnl = priceDiff * quantity;
                          } else if (sym.includes('JPY')) {
                            pnl = (priceDiff * 100000 * (leg.volume || 0)) / 100;
                          } else {
                            pnl = priceDiff * getContractSize(sym) * (leg.volume || 0);
                          }
                        }
                        return (
                          <tr key={leg._id || idx} style={isPartialClose ? { opacity: 0.85 } : {}}>
                            <td style={{ color: 'var(--text-muted, #888)' }}>{idx + 1}</td>
                            <td style={{ fontSize: '11px', color: isPartialClose ? '#f59e0b' : '#10b981' }}>
                              {isPartialClose ? 'Close' : 'Entry'}
                            </td>
                            <td style={{ fontWeight: 'bold', color: legSide === 'buy' ? '#10b981' : '#ef4444' }}>
                              {legSide.toUpperCase()}
                            </td>
                            <td style={{ fontSize: '12px' }}>{new Date(leg.executedAt || leg.closedAt || leg.createdAt).toLocaleString()}</td>
                            <td>{vol}</td>
                            <td>{formatPrice(ep, leg.symbol, true)}</td>
                            <td style={{ fontWeight: 'bold', color: pnl >= 0 ? '#10b981' : '#ef4444' }}>{formatPnL(pnl, leg.symbol)}</td>
                          </tr>
                        );
                      })}
                      {/* Totals Row */}
                      <tr style={{ borderTop: '2px solid var(--border-color, #444)', fontWeight: 'bold' }}>
                        <td colSpan="4" style={{ textAlign: 'right', color: 'var(--text-muted, #888)' }}>Open Volume</td>
                        <td>{parseFloat(Number(legsPosition.volume).toFixed(4))}</td>
                        <td style={{ color: '#f59e0b' }}>Avg: {formatPrice(legsPosition.entryPrice, legsPosition.symbol, true)}</td>
                        <td style={{ color: legsPosition.profit >= 0 ? '#10b981' : '#ef4444' }}>{formatPnL(legsPosition.profit, legsPosition.symbol)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Calculation Explanation */}
              {legsData.length > 1 && (
                <div style={{ padding: '12px 20px', background: 'var(--card-bg, #1a1a2e)', borderTop: '1px solid var(--border-color, #333)', fontSize: '12px', color: 'var(--text-muted, #888)' }}>
                  <strong style={{ color: '#f59e0b' }}>Avg Price Calculation:</strong>{' '}
                  ({legsData.filter(l => l.type === 'open').map((l) => `${parseFloat(Number(l.volume).toFixed(4))}×${formatPrice(l.entryPrice, l.symbol, true)}`).join(' + ')}) ÷ {parseFloat(legsData.filter(l => l.type === 'open').reduce((s, l) => s + (l.volume || 0), 0).toFixed(4))} = {formatPrice(legsPosition.entryPrice, legsPosition.symbol, true)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrdersPage;
