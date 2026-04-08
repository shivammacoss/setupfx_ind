import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getOneClickTradeButtonStyle, isOneClickSymbolBusy } from '../../../hooks/useMetaApiPrices';
import TVChartContainer from '../../../components/TVChart/TVChartContainer';
import tradingSounds from '../../../utils/sounds';
import { isIndianCashEquitySegmentCode } from '../../../constants/indianSegmentLabels';
import {
  NETTING_SEGMENT_CODE_TO_CATEGORY,
  WATCHLIST_CATEGORY_TO_SEGMENT_CODE
} from '../../../constants/nettingSegmentUi';
import { netProfitInrIndianNettingClose } from '../../../utils/indianNettingTradeDisplay';

/** Broker "Search All Instruments" modal tab → netting segment (admin isActive hides tab + list) */
const BROKER_SEARCH_TAB_TO_NETTING_CODE = {
  forex: 'FOREX',
  stocks: 'STOCKS',
  indices: 'INDICES',
  com: 'COMMODITIES',
  indian_nse_eq: 'NSE_EQ',
  indian_nse_fut: 'NSE_FUT',
  indian_nse_opt: 'NSE_OPT',
  indian_bse_eq: 'BSE_EQ',
  indian_bse_fut: 'BSE_FUT',
  indian_bse_opt: 'BSE_OPT',
  indian_mcx_fut: 'MCX_FUT',
  indian_mcx_opt: 'MCX_OPT',
  delta_perpetual: 'CRYPTO_PERPETUAL',
  delta_call_options: 'CRYPTO_OPTIONS',
  delta_put_options: 'CRYPTO_OPTIONS'
};

const BROKER_MODAL_INTL_TABS = ['all', 'forex', 'stocks', 'indices', 'com'];
const BROKER_MODAL_INDIAN_TABS = [
  'indian_nse_eq',
  'indian_nse_fut',
  'indian_nse_opt',
  'indian_bse_eq',
  'indian_bse_fut',
  'indian_bse_opt',
  'indian_mcx_fut',
  'indian_mcx_opt'
];
const BROKER_MODAL_DELTA_TABS = ['delta_perpetual', 'delta_call_options', 'delta_put_options'];
const INTL_NETTING_CODES = ['FOREX', 'STOCKS', 'CRYPTO', 'INDICES', 'COMMODITIES'];

const ORDER_BOOK_HISTORY_PAGE_SIZE = 50;

function metaInstrumentCategoryToNettingCode(category) {
  if (!category) return null;
  const c = String(category).toLowerCase();
  if (c === 'forex' || c === 'forex_yen') return 'FOREX';
  if (c === 'stocks') return 'STOCKS';
  if (c === 'indices') return 'INDICES';
  if (c === 'metals' || c === 'energy') return 'COMMODITIES';
  return null;
}

/** Netting limit orders only: points override, else % of market, else legacy segment points — matches NettingEngine (limit/pending). */
function getNettingLimitAwayOffset(marketPrice, settings) {
  if (!settings || !Number.isFinite(marketPrice) || marketPrice <= 0) return null;
  const pts = settings.limitAwayPoints;
  const pct = settings.limitAwayPercent;
  if (pts != null && Number(pts) > 0) {
    return { away: Number(pts), detail: `${Number(pts)} pts` };
  }
  if (pct != null && Number(pct) > 0) {
    const away = marketPrice * (Number(pct) / 100);
    return { away, detail: `${Number(pct)}% (≈${away.toFixed(2)})` };
  }
  return null;
}

/** Stop / SL-M: points or % of market — same rules as limit orders. */
function getNettingStopSlmAwayOffset(marketPrice, settings) {
  if (!settings || !Number.isFinite(marketPrice) || marketPrice <= 0) return null;
  const pts = settings.limitAwayPoints;
  const pct = settings.limitAwayPercent;
  if (pts != null && Number(pts) > 0) {
    return { away: Number(pts), detail: `${Number(pts)} pts` };
  }
  if (pct != null && Number(pct) > 0) {
    const away = marketPrice * (Number(pct) / 100);
    return { away, detail: `${Number(pct)}% (≈${away.toFixed(2)})` };
  }
  return null;
}

/** Netting options: max |strike − underlying| — script/user points win, else segment % of underlying (matches NettingEngine). */
function getOptionsStrikeMaxDistance(underlying, settings, orderSide) {
  if (!settings || !Number.isFinite(underlying) || underlying <= 0) return null;
  if (orderSide === 'buy') {
    const pts = settings.buyingStrikeFar;
    const pct = settings.buyingStrikeFarPercent;
    if (pts != null && Number(pts) > 0) {
      return { max: Number(pts), detail: `${Number(pts)} (price units from underlying)` };
    }
    if (pct != null && Number(pct) > 0) {
      const max = underlying * (Number(pct) / 100);
      return { max, detail: `${Number(pct)}% of underlying (≈${max.toFixed(2)})` };
    }
  } else {
    const pts = settings.sellingStrikeFar;
    const pct = settings.sellingStrikeFarPercent;
    if (pts != null && Number(pts) > 0) {
      return { max: Number(pts), detail: `${Number(pts)} (price units from underlying)` };
    }
    if (pct != null && Number(pct) > 0) {
      const max = underlying * (Number(pct) / 100);
      return { max, detail: `${Number(pct)}% of underlying (≈${max.toFixed(2)})` };
    }
  }
  return null;
}

function MarketPage() {
  const {
    user,
    API_URL,
    isDark,
    livePrices,
    isMetaApiConnected,
    zerodhaTicks,
    isZerodhaConnected,
    getTickByToken,
    getTickBySymbolAuto,
    zerodhaRefreshStatus,
    instrumentsByCategory,
    visibleInstrumentsByCategory: visibleInstrumentsByCategoryFromLayout,
    nettingSegmentBlockByCode,
    allInstruments,
    addInstrumentToCategory,
    selectedSymbol,
    setSelectedSymbol,
    chartTabs,
    setChartTabs,
    addChartTab,
    removeChartTab,
    tradingMode,
    setTradingMode,
    allowedTradeModes,
    hedgingSettings,
    binarySettings,
    isIndianMarketSymbol,
    watchlist,
    setWatchlist,
    isInWatchlist,
    toggleWatchlist,
    addToWatchlist,
    // Broker instruments (MT5-style search)
    brokerInstruments,
    brokerSearchResults,
    brokerInstrumentsLoading,
    brokerCategories,
    brokerCategoryNames,
    searchBrokerInstruments,
    getBrokerByCategory,
    getBrokerInstrument,
    positions,
    pendingOrders,
    tradeHistory,
    cancelledOrders,
    walletData,
    usdInrRate,
    usdMarkup,
    displayCurrency,
    handleCurrencyChange,
    allowedCurrencyDisplay,
    formatPrice,
    fetchPositions,
    showNotification,
    mobileMarketTab,
    setMobileMarketTab,
    mobileShowChartBelow,
    setMobileShowChartBelow,
    // Trading state
    orderSide,
    setOrderSide,
    orderType,
    setOrderType,
    volume,
    setVolume,
    marginPercent: leverage,
    setMarginPercent: setLeverage,
    limitPrice,
    setLimitPrice,
    stopPrice,
    setStopPrice,
    stopLoss,
    setStopLoss,
    takeProfit,
    setTakeProfit,
    slPips,
    setSlPips,
    tpPips,
    setTpPips,
    orderSession,
    setOrderSession,
    binaryDirection,
    setBinaryDirection,
    binaryAmount,
    setBinaryAmount,
    binaryExpiry,
    setBinaryExpiry,
    // UI state
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    filterTab,
    setFilterTab,
    instrumentsPanelCollapsed,
    setInstrumentsPanelCollapsed,
    expandedSegments,
    toggleSegment,
    oneClickMode,
    setOneClickMode,
    oneClickLotSize,
    setOneClickLotSize,
    // Position management
    handleClosePosition,
    handleModifyPosition,
    handleCancelPendingOrder,
    openEditModal,
    openCloseModal,
    handleExecuteOrder,
    oneClickPending,
    getInstrumentWithLivePrice,
    showEditModal,
    setShowEditModal,
    showCloseModal,
    setShowCloseModal,
    selectedPosition,
    editSL,
    setEditSL,
    editTP,
    setEditTP,
    editPrice,
    setEditPrice,
    closeVolume,
    setCloseVolume,
    getTVSymbol
  } = useOutletContext();

  const visibleInstrumentsByCategory = visibleInstrumentsByCategoryFromLayout ?? instrumentsByCategory;

  const getSegmentViewOnlyLabel = useCallback(
    (categoryLabel) => {
      const code = WATCHLIST_CATEGORY_TO_SEGMENT_CODE[categoryLabel];
      if (!code || nettingSegmentBlockByCode == null) return null;
      const b = nettingSegmentBlockByCode[code];
      if (!b) return null;
      if (b.isActive === false) return 'Inactive';
      if (b.tradingEnabled === false) return 'Trading off';
      return null;
    },
    [nettingSegmentBlockByCode]
  );

  const brokerSearchModalVisibility = useMemo(() => {
    const block = nettingSegmentBlockByCode;
    const nettingSegActive = (code) => {
      if (!code || block == null) return true;
      const b = block[code];
      if (!b) return true;
      return b.isActive !== false;
    };
    const brokerTabVisible = (tabKey) => {
      if (tabKey === 'all') {
        return INTL_NETTING_CODES.some(nettingSegActive);
      }
      const code = BROKER_SEARCH_TAB_TO_NETTING_CODE[tabKey];
      if (!code) return true;
      return nettingSegActive(code);
    };
    const firstVisibleBrokerTab = () => {
      const order = [...BROKER_MODAL_INTL_TABS, ...BROKER_MODAL_INDIAN_TABS, ...BROKER_MODAL_DELTA_TABS];
      for (const t of order) {
        if (brokerTabVisible(t)) return t;
      }
      return 'all';
    };
    const filterInternationalInstrumentList = (list) => {
      if (!list || block == null) return list;
      return list.filter((inst) => nettingSegActive(metaInstrumentCategoryToNettingCode(inst.category)));
    };
    return { brokerTabVisible, firstVisibleBrokerTab, filterInternationalInstrumentList };
  }, [nettingSegmentBlockByCode]);

  const brokerModalShowInternational = useMemo(
    () => BROKER_MODAL_INTL_TABS.some((t) => brokerSearchModalVisibility.brokerTabVisible(t)),
    [brokerSearchModalVisibility]
  );
  const brokerModalShowIndian = useMemo(
    () => BROKER_MODAL_INDIAN_TABS.some((t) => brokerSearchModalVisibility.brokerTabVisible(t)),
    [brokerSearchModalVisibility]
  );
  const brokerModalShowDelta = useMemo(
    () => BROKER_MODAL_DELTA_TABS.some((t) => brokerSearchModalVisibility.brokerTabVisible(t)),
    [brokerSearchModalVisibility]
  );

  const chartContainerRef = useRef(null);
  
  // Timer state for binary trades countdown
  const [timerTick, setTimerTick] = useState(0);

  // Drag-to-resize: positions panel height (vertical)
  const [positionsHeight, setPositionsHeight] = useState(220);
  const [isDraggingResize, setIsDraggingResize] = useState(false);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = positionsHeight;
    setIsDraggingResize(true);
    const onMove = (ev) => {
      const delta = startY - ev.clientY;
      setPositionsHeight(Math.min(Math.max(120, startH + delta), window.innerHeight * 0.65));
    };
    const onUp = () => {
      setIsDraggingResize(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [positionsHeight]);

  // Drag-to-resize: right panel width (horizontal).
  // Default 340px so the SELL/BUY price buttons render fully without
  // text clipping at the edges. Min/max enforced in handleRightPanelDragStart.
  const [rightPanelWidth, setRightPanelWidth] = useState(340);
  const [isDraggingRightPanel, setIsDraggingRightPanel] = useState(false);

  const handleRightPanelDragStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightPanelWidth;
    setIsDraggingRightPanel(true);
    const onMove = (ev) => {
      const delta = startX - ev.clientX;
      setRightPanelWidth(Math.min(Math.max(200, startW + delta), 500));
    };
    const onUp = () => {
      setIsDraggingRightPanel(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [rightPanelWidth]);
  
  // Update timer every second for binary trades
  useEffect(() => {
    const hasBinaryPositions = positions.some(pos => pos.mode === 'binary');
    if (hasBinaryPositions) {
      const interval = setInterval(() => {
        setTimerTick(t => t + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [positions]);

  // Zerodha search state
  const [zerodhaSearchQuery, setZerodhaSearchQuery] = useState('');
  const [zerodhaSearchResults, setZerodhaSearchResults] = useState([]);
  const [zerodhaSearching, setZerodhaSearching] = useState(false);
  const [activeSearchSegment, setActiveSearchSegment] = useState(null);
  const [showZerodhaSearch, setShowZerodhaSearch] = useState(false);
  // -- Segment tabs config for the new inline panel --
  const SEGMENT_TAB_CONFIG = useMemo(() => [
    // International
    { key: 'forex', label: 'Forex', type: 'international' },
    { key: 'stocks', label: 'Stocks', type: 'international' },
    { key: 'indices', label: 'Indices', type: 'international' },
    { key: 'com', label: 'Commodities', type: 'international' },
    // Indian
    { key: 'indian_nse_eq', label: 'NSE EQ', type: 'indian' },
    { key: 'indian_nse_fut', label: 'NSE FUT', type: 'indian' },
    { key: 'indian_nse_opt', label: 'NSE OPT', type: 'indian' },
    { key: 'indian_bse_eq', label: 'BSE EQ', type: 'indian' },
    { key: 'indian_bse_fut', label: 'BSE FUT', type: 'indian' },
    { key: 'indian_bse_opt', label: 'BSE OPT', type: 'indian' },
    { key: 'indian_mcx_fut', label: 'MCX FUT', type: 'indian' },
    { key: 'indian_mcx_opt', label: 'MCX OPT', type: 'indian' },
    // Crypto (Delta)
    { key: 'delta_perpetual', label: 'Crypto Perp', type: 'delta' },
    { key: 'delta_call_options', label: 'Crypto Call', type: 'delta' },
    { key: 'delta_put_options', label: 'Crypto Put', type: 'delta' },
  ], []);

  const visibleSegmentTabs = useMemo(
    () => SEGMENT_TAB_CONFIG.filter(t => brokerSearchModalVisibility.brokerTabVisible(t.key)),
    [SEGMENT_TAB_CONFIG, brokerSearchModalVisibility]
  );

  // Inline search state for Indian segment tabs
  const [inlineIndianQuery, setInlineIndianQuery] = useState('');
  const [inlineIndianResults, setInlineIndianResults] = useState([]);
  const [inlineIndianSearching, setInlineIndianSearching] = useState(false);
  // Inline search for Delta segment tabs
  const [inlineDeltaResults, setInlineDeltaResults] = useState([]);
  const [inlineDeltaLoading, setInlineDeltaLoading] = useState(false);
  const [inlineDeltaQuery, setInlineDeltaQuery] = useState('');

  // When filterTab changes to a segment, reset inline search
  useEffect(() => {
    setInlineIndianQuery('');
    setInlineIndianResults([]);
    setInlineDeltaQuery('');
    setInlineDeltaResults([]);
    // Auto-load delta instruments when switching to a delta tab
    if (filterTab.startsWith('delta_')) {
      const catMap = { 'delta_perpetual': 'perpetual', 'delta_call_options': 'call_options', 'delta_put_options': 'put_options' };
      (async () => {
        setInlineDeltaLoading(true);
        try {
          const url = `${API_URL}/api/delta/instruments?category=${catMap[filterTab] || 'all'}`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.success) setInlineDeltaResults(data.instruments || []);
        } catch {} finally { setInlineDeltaLoading(false); }
      })();
    }
  }, [filterTab, API_URL]);

  // Inline Zerodha search for Indian tabs
  const performInlineIndianSearch = useCallback(async (query, tabKey) => {
    if (!query || query.length < 2) return;
    const segMap = {
      'indian_nse_eq': 'nseEq', 'indian_nse_fut': 'nseFut', 'indian_nse_opt': 'nseOpt',
      'indian_bse_eq': 'bseEq', 'indian_bse_fut': 'bseFut', 'indian_bse_opt': 'bseOpt',
      'indian_mcx_fut': 'mcxFut', 'indian_mcx_opt': 'mcxOpt',
    };
    setInlineIndianSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/zerodha/instruments/search?query=${encodeURIComponent(query)}&segment=${segMap[tabKey] || 'nseEq'}`);
      const data = await res.json();
      if (data.success) setInlineIndianResults(data.instruments || []);
      else setInlineIndianResults([]);
    } catch { setInlineIndianResults([]); }
    finally { setInlineIndianSearching(false); }
  }, [API_URL]);

  // Inline Delta search
  const performInlineDeltaSearch = useCallback(async (query, tabKey) => {
    const catMap = { 'delta_perpetual': 'perpetual', 'delta_call_options': 'call_options', 'delta_put_options': 'put_options' };
    setInlineDeltaLoading(true);
    try {
      const url = query && query.length >= 1
        ? `${API_URL}/api/delta/instruments?search=${encodeURIComponent(query)}&category=${catMap[tabKey] || 'all'}`
        : `${API_URL}/api/delta/instruments?category=${catMap[tabKey] || 'all'}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.success) setInlineDeltaResults(data.instruments || []);
    } catch {} finally { setInlineDeltaLoading(false); }
  }, [API_URL]);

  // Broker instruments search state (MT5-style for all 480+ symbols)
  const [brokerSearchQuery, setBrokerSearchQuery] = useState('');
  const [showBrokerSearch, setShowBrokerSearch] = useState(false);
  const [selectedBrokerCategory, setSelectedBrokerCategory] = useState('all');

  useEffect(() => {
    if (!showBrokerSearch || nettingSegmentBlockByCode === null) return;
    if (!brokerSearchModalVisibility.brokerTabVisible(selectedBrokerCategory)) {
      setSelectedBrokerCategory(brokerSearchModalVisibility.firstVisibleBrokerTab());
    }
  }, [
    showBrokerSearch,
    nettingSegmentBlockByCode,
    selectedBrokerCategory,
    brokerSearchModalVisibility
  ]);

  const [orderBookHistoryPage, setOrderBookHistoryPage] = useState(1);
  const orderBookHistoryPageCount = Math.max(
    1,
    Math.ceil((tradeHistory?.length || 0) / ORDER_BOOK_HISTORY_PAGE_SIZE)
  );

  useEffect(() => {
    setOrderBookHistoryPage((p) => Math.min(Math.max(1, p), orderBookHistoryPageCount));
  }, [orderBookHistoryPageCount, tradeHistory?.length]);

  useEffect(() => {
    if (activeTab !== 'history') setOrderBookHistoryPage(1);
  }, [activeTab]);

  const paginatedOrderBookHistory = useMemo(() => {
    const list = tradeHistory || [];
    const start = (orderBookHistoryPage - 1) * ORDER_BOOK_HISTORY_PAGE_SIZE;
    return list.slice(start, start + ORDER_BOOK_HISTORY_PAGE_SIZE);
  }, [tradeHistory, orderBookHistoryPage]);

  const orderBookHistoryRangeStart =
    (tradeHistory?.length || 0) === 0 ? 0 : (orderBookHistoryPage - 1) * ORDER_BOOK_HISTORY_PAGE_SIZE + 1;
  const orderBookHistoryRangeEnd =
    (tradeHistory?.length || 0) === 0
      ? 0
      : Math.min(orderBookHistoryPage * ORDER_BOOK_HISTORY_PAGE_SIZE, tradeHistory?.length || 0);

  // Delta Exchange state (Crypto Futures & Options)
  const [deltaInstruments, setDeltaInstruments] = useState([]);
  const [deltaSearchQuery, setDeltaSearchQuery] = useState('');
  const [deltaSearchResults, setDeltaSearchResults] = useState([]);
  const [deltaLoading, setDeltaLoading] = useState(false);

  // Netting segment settings state
  const [segmentSettings, setSegmentSettings] = useState(null);
  const [segmentSettingsLoading, setSegmentSettingsLoading] = useState(false);

  // Handle broker instrument search
  useEffect(() => {
    if (brokerSearchQuery.length >= 1) {
      searchBrokerInstruments(brokerSearchQuery, selectedBrokerCategory);
    }
  }, [brokerSearchQuery, selectedBrokerCategory, searchBrokerInstruments]);

  const watchlistCategoryFromBrokerInstrument = (instrument) => {
    const c = instrument.category;
    if (c === 'forex' || c === 'forex_yen') return 'Forex';
    if (c === 'metals' || c === 'energy') return 'Commodities';
    if (c === 'indices') return 'Indices';
    if (c === 'stocks') return 'Stocks (International)';
    if (c === 'crypto_perpetual' || c === 'crypto') return 'Crypto Perpetual';
    return 'Forex';
  };

  // Add broker instrument to watchlist + canonical segment (matches netting segment table)
  const addBrokerInstrumentToWatchlist = (instrument) => {
    addToWatchlist(instrument.symbol);
    const cat = watchlistCategoryFromBrokerInstrument(instrument);
    const cat2 = (instrument.category || '').toLowerCase();
    const inferredExchange = instrument.exchange ||
      (cat2 === 'forex' || cat2 === 'yen' || cat2 === 'forex_yen' ? 'FOREX'
        : cat2 === 'indices' ? 'INDICES'
        : cat2 === 'metals' || cat2 === 'energy' ? 'COMMODITIES'
        : cat2 === 'stocks' ? 'STOCKS'
        : '');
    addInstrumentToCategory(
      {
        symbol: instrument.symbol,
        name: instrument.name || instrument.symbol,
        lotSize: 1,
        tickSize: instrument.category === 'indices' ? 1 : 0.01,
        exchange: inferredExchange,
        category: instrument.category
      },
      cat
    );
    showNotification(`${instrument.symbol} added to favourites`, 'success');
  };

  // Fetch Delta Exchange instruments
  const fetchDeltaInstruments = async (category = 'all') => {
    setDeltaLoading(true);
    try {
      const url = `${API_URL}/api/delta/instruments?category=${category}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.success) {
        setDeltaInstruments(data.instruments || []);
        setDeltaSearchResults(data.instruments || []);
      }
    } catch (error) {
      console.error('Error fetching Delta instruments:', error);
    } finally {
      setDeltaLoading(false);
    }
  };

  // Search Delta Exchange instruments
  const searchDeltaInstruments = async (query, category = 'all') => {
    if (!query || query.length < 1) {
      return fetchDeltaInstruments(category);
    }
    setDeltaLoading(true);
    try {
      const url = `${API_URL}/api/delta/instruments?search=${encodeURIComponent(query)}&category=${category}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.success) {
        setDeltaSearchResults(data.instruments || []);
      }
    } catch (error) {
      console.error('Error searching Delta instruments:', error);
    } finally {
      setDeltaLoading(false);
    }
  };

  // Add Delta instrument to watchlist and segment
  const addDeltaInstrumentToWatchlist = (instrument) => {
    // Add to watchlist (persists to database)
    addToWatchlist(instrument.symbol);
    showNotification(`${instrument.symbol} added to favourites`, 'success');
    
    // Also add to appropriate crypto segment
    // Note: Delta Exchange India only has perpetual_futures (no dated futures)
    const segmentMap = {
      'perpetual_futures': 'Crypto Perpetual',
      'call_options': 'Crypto Options',
      'put_options': 'Crypto Options'
    };
    const segment = segmentMap[instrument.contract_type];
    if (segment) {
      // Note: addInstrumentToCategory expects (instrumentData, categoryKey)
      addInstrumentToCategory({
        symbol: instrument.symbol,
        name: instrument.name,
        category: 'crypto_derivative',
        contract_type: instrument.contract_type,
        underlying: instrument.underlying,
        expiry: instrument.expiry,
        source: 'delta_exchange'
      }, segment);
    }
  };

  // SL/TP visibility state (collapsed by default)
  const [showStopLoss, setShowStopLoss] = useState(false);
  const [showTakeProfit, setShowTakeProfit] = useState(false);
  const [showPositionSize, setShowPositionSize] = useState(false);
  const [showOrderTypeMenu, setShowOrderTypeMenu] = useState(false);
  
  // Trade in flight: dim submit + disable to prevent double-submit (no loading label)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  const categoryToSegment = WATCHLIST_CATEGORY_TO_SEGMENT_CODE;

  const MAJOR_CRYPTO_PERP_BASES = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC', 'LINK', 'BCH'];

  const canonicalPerpSymbol = (sym) => {
    const u = String(sym || '').trim().toUpperCase();
    for (const b of MAJOR_CRYPTO_PERP_BASES) {
      if (u === `${b}USD` || u === `${b}USDT` || u === `${b}USD.P` || u === `${b}USDT.P`) return `${b}USD`;
    }
    return u;
  };

  /** Aligns with server NettingEngine segment routing (caps, limits) */
  const resolveSegmentApiName = useCallback(
    (symbol, inst = {}) => {
      if (!symbol) return null;
      const sym = String(symbol).toUpperCase();
      const ex = String(inst.exchange || '').toUpperCase();

      if (inst.source === 'delta_exchange' || ex === 'DELTA' || ex === 'FX_DELTA') {
        const ct = String(inst.contract_type || 'perpetual_futures').toLowerCase();
        if (ct.includes('call_options') || ct.includes('put_options')) return 'CRYPTO_OPTIONS';
        return 'CRYPTO_PERPETUAL';
      }

      if (/^[CP]-/.test(sym)) return 'CRYPTO_OPTIONS';

      if (inst.contract_type) {
        const ct = String(inst.contract_type).toLowerCase();
        if (ct.includes('call_options') || ct.includes('put_options')) return 'CRYPTO_OPTIONS';
        if (ct.includes('future') || ct.includes('perpetual')) return 'CRYPTO_PERPETUAL';
      }

      const forexSix = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
      if (
        sym.endsWith('USD') &&
        !sym.includes('/') &&
        !forexSix.has(sym) &&
        !sym.includes('XAU') &&
        !sym.includes('XAG')
      ) {
        return 'CRYPTO_PERPETUAL';
      }
      if (sym.endsWith('USDT') && !sym.includes('/') && !sym.includes('XAU') && !sym.includes('XAG')) {
        const base = sym.replace(/USDT$/i, '');
        if (MAJOR_CRYPTO_PERP_BASES.includes(base)) return 'CRYPTO_PERPETUAL';
      }

      for (const [key, instruments] of Object.entries(instrumentsByCategory)) {
        if (instruments.some((i) => i.symbol === symbol)) {
          return categoryToSegment[key] || null;
        }
      }

      // MetaAPI / broker instruments not in local JSON: use category + exchange before Zerodha fallbacks
      const cat = String(inst.category || '').toLowerCase();
      const fromInstCategory = metaInstrumentCategoryToNettingCode(cat);
      if (fromInstCategory) return fromInstCategory;

      if (ex === 'INDICES') return 'INDICES';
      if (ex === 'FOREX') return 'FOREX';
      if (ex === 'COMMODITIES') return 'COMMODITIES';
      if (ex === 'STOCKS') return 'STOCKS';

      // Continuous index CFDs (e.g. AUS200Roll) — do not treat as NSE cash equity
      if (/ROLL$/i.test(sym)) return 'INDICES';
      if (!['NSE', 'NFO', 'BSE', 'BFO', 'MCX'].includes(ex)) {
        if (/^(US|UK|DE|EU|JP|AUS|HK|SG|CHINA)[0-9]{2,4}/i.test(sym)) return 'INDICES';
      }

      if (ex === 'NSE') return 'NSE_EQ';
      if (ex === 'NFO') {
        // Check if it's an option (ends with CE or PE)
        if (/[CP]E$/i.test(sym)) return 'NSE_OPT';
        return 'NSE_FUT';
      }
      if (ex === 'MCX') {
        // Check if it's an option (ends with CE or PE)
        if (/[CP]E$/i.test(sym)) return 'MCX_OPT';
        return 'MCX_FUT';
      }
      if (ex === 'BSE') return 'BSE_EQ';
      if (ex === 'BFO') {
        // Check if it's an option (ends with CE or PE)
        if (/[CP]E$/i.test(sym)) return 'BSE_OPT';
        return 'BSE_FUT';
      }

      return null;
    },
    [instrumentsByCategory]
  );

  // Global search state - searches all segments when instrument not found locally
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const globalSearchTimeoutRef = useRef(null);

  // Mobile instrument search state (defined here to be available in useEffect)
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');

  // Map segment names to Zerodha segment codes
  const segmentToZerodhaCode = {
    'NSE EQ': 'nseEq',
    'BSE EQ': 'bseEq',
    'NSE FUT': 'nseFut',
    'NSE OPT': 'nseOpt',
    'MCX FUT': 'mcxFut',
    'MCX OPT': 'mcxOpt',
    'BSE FUT': 'bseFut',
    'BSE OPT': 'bseOpt'
  };

  // Check if segment is Indian market (Zerodha)
  const isIndianSegment = (segment) => {
    return ['NSE EQ', 'BSE EQ', 'NSE FUT', 'NSE OPT', 'MCX FUT', 'MCX OPT', 'BSE FUT', 'BSE OPT'].includes(segment);
  };

  // Search Zerodha instruments
  const searchZerodhaInstruments = useCallback(async (query, segment) => {
    if (!query || query.length < 2) {
      setZerodhaSearchResults([]);
      return;
    }

    const zerodhaSegment = segmentToZerodhaCode[segment];
    if (!zerodhaSegment) return;

    setZerodhaSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/zerodha/instruments/search?query=${encodeURIComponent(query)}&segment=${zerodhaSegment}`);
      const data = await res.json();
      if (data.success) {
        setZerodhaSearchResults(data.instruments || []);
      }
    } catch (error) {
      console.error('Error searching Zerodha instruments:', error);
    } finally {
      setZerodhaSearching(false);
    }
  }, [API_URL]);

  // Add Zerodha instrument to segment
  const addZerodhaInstrument = async (instrument, segment) => {
    try {
      // Subscribe to instrument on backend
      const res = await fetch(`${API_URL}/api/zerodha/instruments/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrument })
      });
      const data = await res.json();
      
      if (data.success) {
        // Add to local instrumentsByCategory
        addInstrumentToCategory(instrument, segment);
        
        // Add to chart and show notification
        addChartTab(instrument.symbol);
        showNotification(`Added ${instrument.symbol} to segment`, 'success', 4000, 'Instrument Added');
        setZerodhaSearchResults([]);
        setZerodhaSearchQuery('');
        setShowZerodhaSearch(false);
      }
    } catch (error) {
      showNotification('Error adding instrument', 'error');
    }
  };

  // Add Zerodha instrument to favourites
  const addZerodhaToFavourites = (instrument) => {
    if (!isInWatchlist(instrument.symbol)) {
      addToWatchlist(instrument.symbol);
      showNotification(`Added ${instrument.symbol} to favourites`, 'success');
    }
  };

  // Global search across all Zerodha segments - triggered when local search has no results
  const performGlobalSearch = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setGlobalSearchResults([]);
      return;
    }

    setGlobalSearching(true);
    const results = [];

    // Search all Zerodha segments
    const zerodhaSegments = [
      { code: 'nseEq', name: 'NSE EQ' },
      { code: 'bseEq', name: 'BSE EQ' },
      { code: 'nseFut', name: 'NSE FUT' },
      { code: 'nseOpt', name: 'NSE OPT' },
      { code: 'mcxFut', name: 'MCX FUT' },
      { code: 'mcxOpt', name: 'MCX OPT' },
      { code: 'bseFut', name: 'BSE FUT' },
      { code: 'bseOpt', name: 'BSE OPT' }
    ];

    // Search all segments in parallel
    const zerodhaPromises = zerodhaSegments.map(async (seg) => {
      try {
        const res = await fetch(`${API_URL}/api/zerodha/instruments/search?query=${encodeURIComponent(query)}&segment=${seg.code}`);
        const data = await res.json();
        if (data.success && data.instruments) {
          return data.instruments.slice(0, 5).map(inst => ({ ...inst, source: 'zerodha', segment: seg.name }));
        }
      } catch (e) { console.log(`Zerodha ${seg.name} search error:`, e); }
      return [];
    });

    // Wait for all searches to complete
    const allResults = await Promise.all([...zerodhaPromises]);
    allResults.forEach(segmentResults => results.push(...segmentResults));

    setGlobalSearchResults(results);
    setGlobalSearching(false);
  }, [API_URL]);

  // Effect to trigger global search - always searches all segments
  useEffect(() => {
    if (globalSearchTimeoutRef.current) {
      clearTimeout(globalSearchTimeoutRef.current);
    }

    // Use either desktop searchQuery or mobile mobileSearchQuery
    const activeQuery = searchQuery || mobileSearchQuery;
    
    if (!activeQuery || activeQuery.length < 2 || (searchQuery && filterTab !== 'ALL SYMBOLS')) {
      setGlobalSearchResults([]);
      return;
    }

    // Always search all segments when query is valid
    globalSearchTimeoutRef.current = setTimeout(() => {
      performGlobalSearch(activeQuery);
    }, 500);

    return () => {
      if (globalSearchTimeoutRef.current) {
        clearTimeout(globalSearchTimeoutRef.current);
      }
    };
  }, [searchQuery, mobileSearchQuery, filterTab, performGlobalSearch]);

  // Add global search result instrument - adds to both segment and favourites
  const addGlobalSearchInstrument = async (inst) => {
    const symbol = inst.symbol || inst.ticker || inst.tkr;
    
    if (inst.source === 'zerodha') {
      await addZerodhaInstrument(inst, inst.segment);
    }
    
    // Also add to favourites
    if (symbol && !isInWatchlist(symbol)) {
      addToWatchlist(symbol);
    }
    
    setGlobalSearchResults([]);
    setSearchQuery('');
    setMobileSearchQuery('');
  };

  // Get selected instrument with live prices
  const staticSelectedInstrument = allInstruments.find(i => i.symbol === selectedSymbol) || allInstruments[0] || { symbol: 'XAUUSD', bid: 0, ask: 0 };
  const selectedInstrument = getInstrumentWithLivePrice(staticSelectedInstrument) || { symbol: 'XAUUSD', bid: 0, ask: 0, low: 0, high: 0, change: 0 };

  // Dynamic font size for order panel price buttons based on text length
  const getPriceFontSize = (price, symbol) => {
    const text = formatPrice(price, symbol);
    const len = text.length;
    if (len > 12) return '12px';
    if (len > 10) return '13px';
    if (len > 8) return '14px';
    return '16px';
  };

  const resolvedSegmentApiName = useMemo(
    () => (selectedSymbol ? resolveSegmentApiName(selectedSymbol, selectedInstrument) : null),
    [selectedSymbol, selectedInstrument, resolveSegmentApiName]
  );

  // Fetch segment settings when segment / symbol changes (netting mode). Pass symbol so script-level block settings apply.
  useEffect(() => {
    if (tradingMode !== 'netting' || !resolvedSegmentApiName || !selectedSymbol) {
      setSegmentSettings(null);
      return;
    }
    const fetchSettings = async () => {
      setSegmentSettingsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('symbol', selectedSymbol);
        if (user?.oderId) params.set('userId', String(user.oderId));
        const res = await fetch(
          `${API_URL}/api/user/segment-settings/${resolvedSegmentApiName}?${params.toString()}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('SetupFX-token')}` } }
        );
        const data = await res.json();
        if (data.success) {
          setSegmentSettings(data.settings);
        } else {
          setSegmentSettings(null);
        }
      } catch (err) {
        console.error('Error fetching segment settings:', err);
        setSegmentSettings(null);
      } finally {
        setSegmentSettingsLoading(false);
      }
    };
    fetchSettings();
  }, [tradingMode, resolvedSegmentApiName, selectedSymbol, user?.oderId]);

  // Netting: NSE/BSE cash equity uses whole-share quantity; lot-based segments (indices, FNO, FX, etc.) use lots — matches NettingSegment limitType
  const nettingVolumeIsShares =
    tradingMode === 'netting' &&
    isIndianCashEquitySegmentCode(resolvedSegmentApiName) &&
    segmentSettings?.limitType !== 'lot';
  const volumeFieldLabel = nettingVolumeIsShares ? 'Quantity' : 'Lot Size';
  const volumeUnitPlural = nettingVolumeIsShares ? 'shares' : 'lots';

  // Determine the effective `X` (margin value from admin settings).
  // Falls back to base intradayMargin/overnightMargin if the specific Option fields are empty (0 or null).
  // This ensures that an admin who sets "100X" for the overall segment and forgets to set optionBuyIntraday will correctly apply 100X to options too.
  const getSegmentMarginX = useCallback(() => {
    if (!segmentSettings) return 0;
    const isOptSeg = resolvedSegmentApiName && ['NSE_OPT', 'BSE_OPT', 'MCX_OPT', 'CRYPTO_OPTIONS'].includes(resolvedSegmentApiName);
    
    if (isOptSeg) {
      if (orderSide === 'buy') {
        const raw = orderSession === 'intraday' ? segmentSettings.optionBuyIntraday : segmentSettings.optionBuyOvernight;
        if (Number(raw) > 0) return Number(raw);
      } else {
        const raw = orderSession === 'intraday' ? segmentSettings.optionSellIntraday : segmentSettings.optionSellOvernight;
        if (Number(raw) > 0) return Number(raw);
      }
    }
    
    // Fallback or Equity/Futures
    const raw = orderSession === 'intraday' ? segmentSettings.intradayMargin : segmentSettings.overnightMargin;
    return Number(raw) || 0;
  }, [segmentSettings, resolvedSegmentApiName, orderSession, orderSide]);

  // Fixed margin or times-multiplier configured for current session/side?
  const hasFixedMargin = useMemo(() => {
    if (tradingMode !== 'netting' || !segmentSettings) return false;
    return getSegmentMarginX() > 0;
  }, [tradingMode, segmentSettings, getSegmentMarginX]);

  const leverageOptionsFromSettings = useMemo(() => {
    if (tradingMode === 'netting' && hasFixedMargin) return [25, 50, 75, 100];
    if (tradingMode === 'hedging') return [10, 25, 50, 100, 200, 500, 1000];
    return null;
  }, [tradingMode, hasFixedMargin]);

  const defaultLeverageOptions = leverageOptionsFromSettings ?? [10, 25, 50, 100, 200, 500, 1000];
  const defaultLeverage = 100;

  // Reset leverage to 100 when segment/session/side changes
  useEffect(() => {
    if (tradingMode === 'netting') {
      setLeverage(100);
    }
  }, [tradingMode, resolvedSegmentApiName, orderSession, orderSide]);

  const overnightDisabled = tradingMode === 'netting' && segmentSettings?.allowOvernight === false;

  /** Shown above netting order form when admin turned off trading or the whole segment */
  const nettingSegmentBlockMessage = useMemo(() => {
    if (tradingMode !== 'netting' || !segmentSettings || segmentSettingsLoading) return null;
    const label =
      (resolvedSegmentApiName && NETTING_SEGMENT_CODE_TO_CATEGORY[resolvedSegmentApiName]) ||
      resolvedSegmentApiName ||
      'this segment';
    if (segmentSettings.isActive === false) {
      return `${label} is inactive. Trading is not available for this segment.`;
    }
    if (segmentSettings.tradingEnabled === false) {
      return `Trading is disabled for ${label}. Prices are for information only — Buy/Sell stay off until the broker enables trading for this segment.`;
    }
    return null;
  }, [tradingMode, segmentSettings, segmentSettingsLoading, resolvedSegmentApiName]);

  useEffect(() => {
    if (overnightDisabled && orderSession === 'carryforward') {
      setOrderSession('intraday');
    }
  }, [overnightDisabled, orderSession, setOrderSession]);

  /** Filled open row only (not pending) — used for exit-only: close-only on symbols that already have an open trade. */
  const openNettingPosition = useMemo(() => {
    const sel = canonicalPerpSymbol(selectedSymbol);
    return (positions || []).find(
      (p) =>
        p.mode === 'netting' &&
        canonicalPerpSymbol(p.symbol) === sel &&
        p.status === 'open'
    );
  }, [positions, selectedSymbol]);

  // Admin binary min/max are in INR; UI amount uses display currency (₹ or $).
  const binaryStakeMeta = useMemo(() => {
    const rate = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);
    const rawMin = Number(binarySettings?.minTradeAmount);
    const rawMax = Number(binarySettings?.maxTradeAmount);
    const minInr = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 100;
    let maxInr = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 100_000_000;
    if (maxInr < minInr) maxInr = minInr;
    const minDisp = displayCurrency === 'INR' ? minInr : minInr / rate;
    const maxDisp = displayCurrency === 'INR' ? maxInr : maxInr / rate;
    const stepInr = minInr < 50 ? 1 : 10;
    const stepDisp =
      displayCurrency === 'INR'
        ? stepInr
        : Math.max(0.01, Math.round((stepInr / rate) * 10000) / 10000);
    return { rate, minInr, maxInr, minDisp, maxDisp, stepDisp };
  }, [usdInrRate, usdMarkup, binarySettings?.minTradeAmount, binarySettings?.maxTradeAmount, displayCurrency]);

  const clampBinaryStakeDisplay = useCallback(
    (v) => {
      const x = Math.min(binaryStakeMeta.maxDisp, Math.max(binaryStakeMeta.minDisp, v));
      if (displayCurrency === 'INR') return Math.round(x);
      return Math.round(x * 10000) / 10000;
    },
    [binaryStakeMeta, displayCurrency]
  );

  // Volume validation with segment settings for netting mode
  const lotOrderValidation = useMemo(() => {
    if (tradingMode === 'binary') {
      const amt = Number(binaryAmount);
      const messages = [];
      if (!Number.isFinite(amt) || amt <= 0) {
        return { valid: false, messages: ['Enter a valid trade amount.'], canSubmit: false };
      }
      const stakeInr = displayCurrency === 'INR' ? amt : amt * binaryStakeMeta.rate;
      if (stakeInr < binaryStakeMeta.minInr - 1e-6) {
        messages.push(`Minimum stake is ₹${binaryStakeMeta.minInr}.`);
      }
      if (stakeInr > binaryStakeMeta.maxInr + 1e-6) {
        messages.push(`Maximum stake is ₹${binaryStakeMeta.maxInr}.`);
      }
      const allowed = binarySettings?.allowedExpiries;
      if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(binaryExpiry)) {
        messages.push('Choose one of the allowed expiry times.');
      }
      const canSubmit = messages.length === 0;
      return { valid: canSubmit, messages, canSubmit };
    }

    const messages = [];
    let canSubmit = true;

    // Check if segment is active and trading enabled
    if (tradingMode === 'netting' && segmentSettings) {
      if (segmentSettings.isActive === false) {
        return {
          valid: false,
          messages: ['This segment is inactive — it is hidden from the list and not available for trading.'],
          canSubmit: false
        };
      }
      if (segmentSettings.tradingEnabled === false) {
        return {
          valid: false,
          messages: ['Trading is turned off for this segment — you can view prices, but Buy/Sell is disabled.'],
          canSubmit: false
        };
      }
      if (segmentSettings.exitOnlyMode === true) {
        if (!openNettingPosition) {
          return {
            valid: false,
            messages: [
              'Exit only mode: you cannot open a new position on this segment. Choose a symbol where you already have an open trade, then trade the opposite side to close (only).'
            ],
            canSubmit: false
          };
        }
      }
    }

    const raw = String(volume ?? '').trim();
    if (raw === '' || raw === '.' || raw === '-') {
      return { valid: false, messages: [nettingVolumeIsShares ? 'Enter a valid quantity.' : 'Enter a valid lot size.'], canSubmit: false };
    }
    const vol = parseFloat(raw);
    if (Number.isNaN(vol) || vol <= 0) {
      return { valid: false, messages: [nettingVolumeIsShares ? 'Enter a valid quantity.' : 'Enter a valid lot size.'], canSubmit: false };
    }

    // Exit only: only reduce/close the open row — no same-side adds, no size larger than open (would flip)
    if (tradingMode === 'netting' && segmentSettings?.exitOnlyMode === true && openNettingPosition) {
      const posSide = String(openNettingPosition.side || '').toLowerCase();
      const orderVol = nettingVolumeIsShares ? Math.round(vol) : vol;
      const openVol =
        Number(
          nettingVolumeIsShares
            ? openNettingPosition.quantity ?? openNettingPosition.volume
            : openNettingPosition.volume
        ) || 0;
      const isClosing =
        (posSide === 'buy' && orderSide === 'sell') || (posSide === 'sell' && orderSide === 'buy');
      if (!isClosing) {
        messages.push(
          'Exit only mode: only closing is allowed — use the opposite side (sell to close a buy, buy to close a sell). You cannot add to this position.'
        );
        canSubmit = false;
      } else if (orderVol > openVol + 1e-9) {
        messages.push(
          `Exit only mode: you can close at most ${openVol} ${nettingVolumeIsShares ? 'shares' : 'lots'} (your open size). A larger size would open a reverse position.`
        );
        canSubmit = false;
      }
    }

    // Quantity validation for shares (NSE_EQ, BSE_EQ)
    if (nettingVolumeIsShares) {
      if (Math.abs(vol - Math.round(vol)) > 1e-9) {
        return { valid: false, messages: ['Quantity must be a whole number.'], canSubmit: false };
      }
      
      // Use segment settings for quantity limits
      if (tradingMode === 'netting' && segmentSettings) {
        const minQty = segmentSettings.minQty || 1;
        const perOrderQty = segmentSettings.perOrderQty;
        const maxQtyPerScript = segmentSettings.maxQtyPerScript;
        
        if (vol < minQty) {
          messages.push(`Minimum quantity is ${minQty}.`);
          canSubmit = false;
        }
        if (perOrderQty && vol > perOrderQty) {
          messages.push(`Max ${perOrderQty} qty per order.`);
          canSubmit = false;
        }
        if (maxQtyPerScript && vol > maxQtyPerScript) {
          messages.push(`Max ${maxQtyPerScript} qty per script.`);
          canSubmit = false;
        }
      } else if (vol < 1) {
        messages.push('Minimum quantity is 1 share.');
        canSubmit = false;
      }
    } else {
      // Lot validation
      if (tradingMode === 'netting' && segmentSettings) {
        const minLots = segmentSettings.minLots ?? 0.01;
        const orderLots = segmentSettings.orderLots;
        const maxLots = segmentSettings.maxLots;
        
        if (vol < minLots) {
          messages.push(`Minimum lot size is ${minLots}.`);
          canSubmit = false;
        }
        if (orderLots && vol > orderLots) {
          messages.push(`Max ${orderLots} lots per order.`);
          canSubmit = false;
        }
        if (maxLots && vol > maxLots) {
          messages.push(`Max ${maxLots} lots per script.`);
          canSubmit = false;
        }
      } else if (vol < 0.01) {
        messages.push('Minimum lot size is 0.01.');
        canSubmit = false;
      }
    }

    // Options strike vs underlying (netting): |strike − underlying| ≤ max, max = points or underlying×%/100 — matches NettingEngine
    const isOptionSegment = tradingMode === 'netting' && ['NSE_OPT', 'BSE_OPT', 'MCX_OPT'].includes(resolvedSegmentApiName);

    if (isOptionSegment && segmentSettings) {
      let strikePrice = selectedInstrument?.strike || 0;
      const underlyingMatch = selectedSymbol.match(/^([A-Z]+)/i);
      const underlyingSymbol = underlyingMatch ? underlyingMatch[1] : 'NIFTY';

      if (!strikePrice) {
        const sym = selectedSymbol.toUpperCase();
        const rest = sym.replace(/^[A-Z]+/, '');
        if (rest.length >= 7) {
          const afterDate = rest.substring(5);
          const strikeMatch = afterDate.match(/^(\d+)([CP]E)$/);
          if (strikeMatch) {
            strikePrice = parseInt(strikeMatch[1], 10);
          }
        }
      }

      const hasOptRule =
        (segmentSettings.buyingStrikeFar != null && segmentSettings.buyingStrikeFar > 0) ||
        (segmentSettings.buyingStrikeFarPercent != null && segmentSettings.buyingStrikeFarPercent > 0) ||
        (segmentSettings.sellingStrikeFar != null && segmentSettings.sellingStrikeFar > 0) ||
        (segmentSettings.sellingStrikeFarPercent != null && segmentSettings.sellingStrikeFarPercent > 0);

      if (strikePrice > 0 && hasOptRule) {
        let underlyingPrice = 0;
        const underlyingVariants = [
          underlyingSymbol,
          `${underlyingSymbol}FUT`,
          `${underlyingSymbol}26MARFUT`,
          `${underlyingSymbol}24MARFUT`
        ];
        if (getTickBySymbolAuto) {
          for (const variant of underlyingVariants) {
            const tick = getTickBySymbolAuto(variant);
            if (tick?.lastPrice > 0) {
              underlyingPrice = tick.lastPrice;
              break;
            }
          }
        }
        if (underlyingPrice === 0) {
          for (const variant of underlyingVariants) {
            if (livePrices[variant]?.bid > 0) {
              underlyingPrice = livePrices[variant].bid;
              break;
            }
          }
        }

        if (underlyingPrice > 0) {
          const band = getOptionsStrikeMaxDistance(underlyingPrice, segmentSettings, orderSide);
          if (band) {
            const strikeDistance = Math.abs(strikePrice - underlyingPrice);
            if (strikeDistance > band.max) {
              messages.push(
                `Strike ${strikePrice} is ${strikeDistance.toFixed(0)} from underlying ${underlyingPrice.toFixed(2)}; max allowed ${band.max.toFixed(2)} (${band.detail}).`
              );
              canSubmit = false;
            }
          }
        } else {
          console.log(`[Options] Cannot validate strike distance - underlying price not available for ${underlyingSymbol}`);
        }
      }
    }

    // Netting: % away applies to limit orders only (server: limit/pending). Stop / SL-M keep points-only checks.
    if (tradingMode === 'netting' && orderType !== 'market') {
      const currentPrice = orderSide === 'buy' ? (selectedInstrument?.ask || 0) : (selectedInstrument?.bid || 0);
      const orderPrice = parseFloat(limitPrice) || 0;

      if (orderPrice > 0 && currentPrice > 0) {
        if (orderType === 'limit') {
          const band = getNettingLimitAwayOffset(currentPrice, segmentSettings);
          if (band) {
            const { away, detail } = band;
            // Limit Away Logic: Orders must be OUTSIDE the % range (not too close to market)
            // Example: 1% away means order must be at least 1% below (buy) or above (sell) market price
            if (orderSide === 'buy') {
              if (orderPrice > currentPrice) {
                messages.push(`Limit Buy cannot be above market (${currentPrice.toFixed(2)}).`);
                canSubmit = false;
              } else if (orderPrice > currentPrice - away) {
                messages.push(
                  `Limit Buy too close to market. Must be at least ${detail} below. Max allowed ${(currentPrice - away).toFixed(2)}.`
                );
                canSubmit = false;
              }
            } else {
              if (orderPrice < currentPrice) {
                messages.push(`Limit Sell cannot be below market (${currentPrice.toFixed(2)}).`);
                canSubmit = false;
              } else if (orderPrice < currentPrice + away) {
                messages.push(
                  `Limit Sell too close to market. Must be at least ${detail} above. Min allowed ${(currentPrice + away).toFixed(2)}.`
                );
                canSubmit = false;
              }
            }
          }
        } else if (orderType === 'stop' || orderType === 'slm') {
          const band = getNettingStopSlmAwayOffset(currentPrice, segmentSettings);
          if (band) {
            const minBuyPrice = currentPrice + band.away;
            const maxSellPrice = currentPrice - band.away;
            if (orderSide === 'buy' && orderPrice < minBuyPrice) {
              messages.push(`Stop Buy must be ≥ ${minBuyPrice.toFixed(2)} (${band.detail} above market).`);
              canSubmit = false;
            } else if (orderSide === 'sell' && orderPrice > maxSellPrice) {
              messages.push(`Stop Sell must be ≤ ${maxSellPrice.toFixed(2)} (${band.detail} below market).`);
              canSubmit = false;
            }
          }
        }
      }
    }

    return { valid: messages.length === 0, messages, canSubmit };
  }, [
    tradingMode,
    volume,
    nettingVolumeIsShares,
    segmentSettings,
    openNettingPosition,
    selectedInstrument,
    resolvedSegmentApiName,
    orderSide,
    getTickBySymbolAuto,
    livePrices,
    selectedSymbol,
    orderType,
    limitPrice,
    binaryAmount,
    binaryExpiry,
    binarySettings,
    displayCurrency,
    binaryStakeMeta
  ]);

  // Auto-round volume for shares mode
  useEffect(() => {
    if (!nettingVolumeIsShares) return;
    setVolume((prev) => {
      const v = parseFloat(String(prev).trim());
      if (!Number.isFinite(v) || v < 1) return '1';
      if (Math.abs(v - Math.round(v)) > 1e-9) return String(Math.max(1, Math.round(v)));
      return String(Math.round(v));
    });
  }, [selectedSymbol, nettingVolumeIsShares, setVolume]);


  // Calculate pip value
  const getPipValue = (symbol) => {
    if (!symbol) return 0.0001;
    if (symbol.includes('JPY')) return 0.01;
    if (symbol === 'XAUUSD' || symbol === 'XPTUSD') return 0.1;
    if (symbol === 'BTCUSD') return 1;
    if (symbol === 'US100' || symbol === 'US2000') return 0.1;
    return 0.0001;
  };

  const pipValue = getPipValue(selectedSymbol);
  const entryPrice = orderSide === 'buy' ? (selectedInstrument.ask || 0) : (selectedInstrument.bid || 0);
  const volumeNum = nettingVolumeIsShares
    ? Math.max(1, Math.round(parseFloat(volume) || 1))
    : parseFloat(volume) || 0.01;

  // Contract size calculation
  const getContractSize = (symbol) => {
    // Check if it's an Indian market instrument
    const inst = allInstruments.find(i => i.symbol === symbol);
    if (inst?.category?.startsWith('nse_') || inst?.category?.startsWith('mcx_') || inst?.category?.startsWith('bse_')) {
      // For Indian markets, use lot size (default 1 for equity)
      return inst.lotSize || 1;
    }
    
    if (symbol.includes('BTC')) return 1;
    if (symbol.includes('ETH')) return 1;
    if (symbol.includes('ADA')) return 1000;
    if (symbol === 'XAUUSD') return 100;
    if (symbol === 'XAGUSD') return 5000;
    if (symbol === 'XPTUSD') return 100;
    if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') return 1;
    if (symbol === 'BRENT' || symbol.includes('OIL')) return 1000;
    return 100000;
  };

  const contractSize = getContractSize(selectedSymbol);
  const marginRequired = (volumeNum * contractSize * entryPrice) / leverage;

  // Calculate SL/TP prices
  const calculateSlPrice = () => {
    if (orderSide === 'buy') {
      return (entryPrice - (slPips * pipValue)).toFixed(selectedInstrument.bid < 10 ? 5 : 2);
    }
    return (entryPrice + (slPips * pipValue)).toFixed(selectedInstrument.bid < 10 ? 5 : 2);
  };

  const calculateTpPrice = () => {
    if (orderSide === 'buy') {
      return (entryPrice + (tpPips * pipValue)).toFixed(selectedInstrument.bid < 10 ? 5 : 2);
    }
    return (entryPrice - (tpPips * pipValue)).toFixed(selectedInstrument.bid < 10 ? 5 : 2);
  };

  // Check market hours
  const checkMarketHours = (symbol) => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getUTCHours();

    // Crypto markets are 24/7
    if (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('ADA') || 
        symbol.includes('DOGE') || symbol.includes('SOL') || symbol.includes('XRP') ||
        selectedInstrument?.category?.toLowerCase()?.includes('crypto')) {
      return { isOpen: true, reason: 'Crypto markets are 24/7' };
    }

    // Check if this is an Indian instrument (MCX, NSE, BSE)
    const isIndianInstrument = selectedInstrument?.exchange && 
      ['NSE', 'BSE', 'NFO', 'BFO', 'MCX'].includes(selectedInstrument.exchange.toUpperCase());
    
    // Also check category for Indian instruments
    const category = selectedInstrument?.category?.toLowerCase() || '';
    const isIndianCategory = category.includes('nse') || category.includes('bse') || 
                             category.includes('mcx') || category.includes('nfo') || 
                             category.includes('bfo');

    if (isIndianInstrument || isIndianCategory) {
      // Indian market hours: Mon-Fri, 9:15 AM - 3:30 PM IST (3:45 AM - 10:00 AM UTC)
      // MCX: Mon-Fri, 9:00 AM - 11:30 PM IST (3:30 AM - 6:00 PM UTC)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return { isOpen: false, reason: 'Indian markets closed on weekends' };
      }
      // For now, allow trading during weekdays - server will validate actual hours
      return { isOpen: true, reason: 'Indian market hours' };
    }

    // Forex/Commodities (XAUUSD, EURUSD, etc.) - 24/5 trading
    // Open: Sunday 22:00 UTC, Close: Friday 22:00 UTC
    // Saturday: Always closed
    if (dayOfWeek === 6) {
      return { isOpen: false, reason: 'Forex/Commodities market closed on Saturday' };
    }
    // Sunday before 22:00 UTC: Closed
    if (dayOfWeek === 0 && hour < 22) {
      return { isOpen: false, reason: 'Forex/Commodities market opens Sunday 22:00 UTC' };
    }
    // Friday after 22:00 UTC: Closed
    if (dayOfWeek === 5 && hour >= 22) {
      return { isOpen: false, reason: 'Forex/Commodities market closed Friday 22:00 UTC' };
    }

    return { isOpen: true, reason: 'Market is open' };
  };

  // Calculate required margin
  const calculateRequiredMargin = () => {
    const vol = nettingVolumeIsShares
      ? Math.max(1, Math.round(parseFloat(volume) || 1))
      : parseFloat(volume) || 0.01;
    
    // Get price based on order side (using spread-adjusted instrument)
    let price = orderSide === 'sell' ? (selectedInstrument?.bid || 0) : (selectedInstrument?.ask || 0);

    // Fallback
    if (price === 0) {
      price = selectedInstrument?.lastPrice || 0;
    }

    if (tradingMode === 'binary') return parseFloat(binaryAmount) || 0;

    const marginFactor = leverage / 100;

    if (tradingMode === 'netting') {
      if (segmentSettings && price > 0) {
        const lotSize = selectedInstrument?.lotSize || 1;
        const quantity = nettingVolumeIsShares ? vol : vol * lotSize;
        const isIndian = isIndianInstrument(selectedSymbol);

        const applyNettingFixed = (raw, mode) => {
          const r = Number(raw);
          if (!(r > 0)) return null;
          const effectiveMode = mode === true ? 'percent' : (mode === false ? 'fixed' : (mode || 'fixed'));
          let result;
          switch (effectiveMode) {
            case 'percent': {
              const pct = Math.min(r, 100);
              result = quantity * price * (pct / 100);
              break;
            }
            case 'times': {
              // Apply leverage percentage to multiplier (25% of 500X = 125X effective)
              const effectiveMultiplier = r * (leverage / 100);
              result = (quantity * price) / effectiveMultiplier;
              break;
            }
            case 'fixed':
            default:
              result = r * vol;
              // Fixed margin is always in INR (set by admin).
              // For non-Indian instruments, formatMargin expects USD → converts to display currency.
              // So we must convert from INR to USD here.
              if (!isIndian) {
                const rate = usdInrRate + usdMarkup;
                if (rate > 0) result = result / rate;
              }
              break;
          }
          return result;
        };

        // Use the unified getSegmentMarginX which correctly falls back for Options without specific margin set
        const raw = getSegmentMarginX();
        const m = applyNettingFixed(raw, segmentSettings.marginCalcMode);
        if (m != null) return m;
      }
      
      // Fallback: quantity * price * marginFactor
      const lotSize = selectedInstrument?.lotSize || 1;
      const quantity = nettingVolumeIsShares ? vol : vol * lotSize;
      return quantity * price * marginFactor;
    }

    // Hedging mode
    const cs = getContractSize(selectedSymbol);
    const notional = vol * cs * price;
    return notional * marginFactor;
  };

  // Handle order placement
  const handlePlaceOrder = async (forcedSide) => {
    const activeSide = typeof forcedSide === 'string' ? forcedSide : orderSide;

    if (isPlacingOrder) return;
    if (!lotOrderValidation.canSubmit) return;

    try {
      setIsPlacingOrder(true);
      
      const marketStatus = checkMarketHours(selectedSymbol);
      if (!marketStatus.isOpen) {
        alert(`❌ Market Closed\n\n${selectedSymbol} is currently not available for trading.\n\n${marketStatus.reason}`);
        setIsPlacingOrder(false);
        return;
      }

      const requiredMargin = calculateRequiredMargin();
      const _balRate = usdInrRate + usdMarkup;
      const _isIndianSeg = tradingMode === 'netting' && resolvedSegmentApiName &&
        ['NSE_EQ','NSE_FUT','NSE_OPT','BSE_EQ','BSE_FUT','BSE_OPT','MCX_FUT','MCX_OPT'].includes(resolvedSegmentApiName);
      // Use balance (not equity/freeMargin) so available is stable and doesn't float with open P&L
      const balanceLocal = _isIndianSeg
        ? (walletData?.balance || 0) * _balRate
        : (walletData?.balance || 0);

      // Times mode: buying power = balance × X × leverage%
      // Margin = tradeValue / X, so check: marginRequired <= balance × (leverage/100)
      const _isTimesMode = tradingMode === 'netting' && segmentSettings?.marginCalcMode === 'times';
      const _timesX = _isTimesMode ? getSegmentMarginX() : 0;
      const effectiveAvailable = _isTimesMode && _timesX > 0
        ? balanceLocal * (leverage / 100)
        : balanceLocal;

      if (requiredMargin > effectiveAvailable) {
        const _cs = _isIndianSeg ? '₹' : '$';
        const fmtAvail = _isTimesMode && _timesX > 0
          ? `${_cs}${(balanceLocal * _timesX * (leverage / 100)).toLocaleString('en-IN', { maximumFractionDigits: 2 })} buying power (${leverage}% of ${_timesX}X)`
          : `${_cs}${balanceLocal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
        alert(`❌ Insufficient Balance\n\nRequired margin: ${formatMargin(requiredMargin)}\nAvailable: ${fmtAvail}`);
        setIsPlacingOrder(false);
        return;
      }

      // Use spread-adjusted prices from selectedInstrument (what user sees = what they trade at)
      let currentBid = selectedInstrument.bid || 0;
      let currentAsk = selectedInstrument.ask || 0;

      if (!currentBid || !currentAsk || currentBid <= 0 || currentAsk <= 0) {
        alert(`❌ No Price Data\n\n${selectedSymbol} has no price data available.`);
        setIsPlacingOrder(false);
        return;
      }

      const vol = parseFloat(volume) || (nettingVolumeIsShares ? 1 : 0.01);
      const minVol = nettingVolumeIsShares ? 1 : 0.01;
      if (nettingVolumeIsShares && Math.abs(vol - Math.round(vol)) > 1e-9) {
        alert('Quantity must be a whole number (minimum 1 share).');
        setIsPlacingOrder(false);
        return;
      }
      if (vol < minVol - 1e-9) {
        alert(
          nettingVolumeIsShares
            ? `Minimum quantity is ${minVol} shares`
            : `Minimum lot size is ${minVol}`
        );
        setIsPlacingOrder(false);
        return;
      }

      const orderVolume =
        tradingMode === 'netting' && nettingVolumeIsShares ? Math.round(vol) : vol;

      let orderPayload;

      // Get exchange info for market timing validation
      let instrumentExchange = selectedInstrument?.exchange || null;
      let instrumentSegment = selectedInstrument?.segment || '';

      // Delta Exchange: tag DELTA + contract_type so NettingEngine maps to CRYPTO_PERPETUAL / CRYPTO_OPTIONS
      const isDeltaExchangeSymbol =
        selectedSymbol.startsWith('C-') ||
        selectedSymbol.startsWith('P-') ||
        selectedInstrument?.source === 'delta_exchange';

      if (isDeltaExchangeSymbol) {
        instrumentExchange = 'DELTA';
        instrumentSegment = selectedInstrument?.contract_type || 'perpetual_futures';
        console.log('[MarketPage] Delta Exchange → netting segment key:', instrumentSegment);
      } else if (!instrumentExchange && selectedInstrument?.category) {
        const cat = selectedInstrument.category.toLowerCase();
        if (cat.startsWith('nse')) instrumentExchange = 'NSE';
        else if (cat.startsWith('nfo') || cat.includes('fut') || cat.includes('opt')) instrumentExchange = 'NFO';
        else if (cat.startsWith('mcx')) instrumentExchange = 'MCX';
        else if (cat.startsWith('bse')) instrumentExchange = 'BSE';
        else if (cat.startsWith('bfo')) instrumentExchange = 'BFO';
        // Global MetaAPI segments — set explicit exchange so server uses correct segment settings
        else if (cat === 'forex' || cat === 'yen' || cat === 'forex_yen') instrumentExchange = 'FOREX';
        else if (cat === 'indices') instrumentExchange = 'INDICES';
        else if (cat === 'commodity' || cat === 'metals' || cat === 'energy') instrumentExchange = 'COMMODITIES';
        else if (cat === 'stocks') instrumentExchange = 'STOCKS';
        // crypto_perpetual: leave null — server uses inferDeltaExchangeSegment or explicit DELTA
      }
      // Also check watchlist category key for instruments without category on instrument object
      const categoryKey = Object.entries(instrumentsByCategory).find(([key, instruments]) =>
        instruments.some(i => i.symbol === selectedSymbol)
      )?.[0];
      if (!instrumentExchange && categoryKey && !isDeltaExchangeSymbol) {
        if (categoryKey.includes('MCX')) instrumentExchange = 'MCX';  // MCX before NSE/BSE to avoid COMMODITIES fallback
        else if (categoryKey.includes('NSE')) instrumentExchange = categoryKey.includes('FUT') || categoryKey.includes('OPT') ? 'NFO' : 'NSE';
        else if (categoryKey.includes('BSE')) instrumentExchange = categoryKey.includes('FUT') || categoryKey.includes('OPT') ? 'BFO' : 'BSE';
        else if (categoryKey === 'Forex') instrumentExchange = 'FOREX';
        else if (categoryKey === 'Indices') instrumentExchange = 'INDICES';
        else if (categoryKey === 'Commodities') instrumentExchange = 'COMMODITIES';
        else if (categoryKey === 'Stocks (International)') instrumentExchange = 'STOCKS';
        // Crypto Perpetual / Crypto Options: leave null (server handles via pattern/Delta inference)
      }
      
      // Final fallback: detect MCX symbols by pattern (GOLD, SILVER, ZINC, COPPER, CRUDE, etc.)
      if (!instrumentExchange && !isDeltaExchangeSymbol) {
        const mcxPatterns = ['GOLD', 'SILVER', 'ZINC', 'COPPER', 'CRUDE', 'NATURALGAS', 'ALUMINIUM', 'LEAD', 'NICKEL', 'COTTON', 'CRUDEOIL'];
        const symUpper = selectedSymbol.toUpperCase();
        if (mcxPatterns.some(p => symUpper.startsWith(p))) {
          instrumentExchange = 'MCX';
          console.log('[MarketPage] MCX symbol detected by pattern:', selectedSymbol);
        }
      }
      
      console.log('[MarketPage] Trade - symbol:', selectedSymbol, 'exchange:', instrumentExchange, 'segment:', instrumentSegment, 'category:', selectedInstrument?.category, 'categoryKey:', categoryKey);

      if (tradingMode === 'hedging') {
        orderPayload = {
          mode: 'hedging',
          userId: user?.id || 'guest',
          symbol: selectedSymbol,
          orderType,
          side: activeSide,
          volume: vol,
          price: orderType === 'market' ? (activeSide === 'buy' ? currentAsk : currentBid) : orderType === 'limit' ? parseFloat(limitPrice) : parseFloat(stopPrice),
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          takeProfit: takeProfit ? parseFloat(takeProfit) : null,
          leverage,
          isMarketOpen: true,
          exchange: instrumentExchange,
          segment: instrumentSegment,
          lotSize: selectedInstrument?.lotSize || null,
          marketData: { bid: currentBid, ask: currentAsk },
          spreadPreApplied: orderType === 'market'
        };
      } else if (tradingMode === 'netting') {
        // For netting mode, SL-M uses limitPrice field (Trigger Price input)
        const orderPrice = orderType === 'market'
          ? (activeSide === 'buy' ? currentAsk : currentBid)
          : parseFloat(limitPrice) || parseFloat(stopPrice);

        orderPayload = {
          mode: 'netting',
          userId: user?.id || 'guest',
          symbol: selectedSymbol,
          orderType: orderType === 'slm' ? 'stop' : orderType, // Convert slm to stop for backend
          side: activeSide,
          volume: orderVolume,
          price: orderPrice,
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          takeProfit: takeProfit ? parseFloat(takeProfit) : null,
          leverage, // Pass leverage for netting mode
          session: orderSession,
          isMarketOpen: true,
          exchange: instrumentExchange,
          segment: instrumentSegment,
          lotSize: selectedInstrument?.lotSize || null,
          marketData: { bid: currentBid, ask: currentAsk },
          spreadPreApplied: orderType === 'market'
        };
      } else if (tradingMode === 'binary') {
        // Convert INR to USD if user is trading in INR display mode
        const effectiveRate = usdInrRate + usdMarkup;
        const amountInUsd = displayCurrency === 'INR' ? binaryAmount / effectiveRate : binaryAmount;
        
        orderPayload = {
          mode: 'binary',
          userId: user?.id || 'guest',
          symbol: selectedSymbol,
          direction: binaryDirection,
          amount: amountInUsd,
          expiry: binaryExpiry,
          entryPrice: currentBid,
          isMarketOpen: true,
          exchange: instrumentExchange,
          segment: instrumentSegment
        };
      }

      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        tradingSounds.playError();
        const errMsg = result.error || result.message || `Order failed (${response.status})`;
        showNotification(errMsg, 'error', 10000, 'Order blocked');
        alert(`⚠️ ${errMsg}`);
        return;
      }

      if (result.success) {
        // Play trade executed sound
        tradingSounds.playTradeExecuted();
        
        fetchPositions();
        setLimitPrice('');
        setStopPrice('');
        setStopLoss('');
        setTakeProfit('');

        if (tradingMode === 'hedging' || tradingMode === 'netting') {
          const execUnit =
            tradingMode === 'netting' && isIndianCashEquitySegmentCode(resolvedSegmentApiName)
              ? 'shares'
              : 'lots';
          const isPendingOrder = orderType === 'limit' || orderType === 'stop' || orderType === 'slm';
          showNotification(
            `${orderSide.toUpperCase()} ${tradingMode === 'netting' && nettingVolumeIsShares ? orderVolume : vol} ${execUnit} ${selectedSymbol} @ ${orderPayload.price}`,
            isPendingOrder ? 'warning' : 'success',
            4000,
            isPendingOrder ? 'Pending Order Placed' : 'Trade Executed'
          );
        } else if (tradingMode === 'binary') {
          const expiryText = binaryExpiry >= 3600 ? `${Math.floor(binaryExpiry / 3600)}h` : `${Math.floor(binaryExpiry / 60)}m`;
          showNotification(`${binaryDirection.toUpperCase()} ${displayCurrency === 'INR' ? '₹' : '$'}${binaryAmount} on ${selectedSymbol} - ${expiryText}`, 'success', 4000, 'Trade Executed');
        }
      } else {
        tradingSounds.playError();
        const errMsg = result.error || result.message || 'Order was not accepted';
        showNotification(errMsg, 'error', 10000, 'Order blocked');
        alert(`⚠️ ${errMsg}`);
      }
    } catch (error) {
      showNotification(`Server error: ${error.message}`, 'error');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Check if symbol is Indian market (may not be available on free TradingView)
  const isIndianSymbol = useCallback((symbol) => {
    const inst = allInstruments.find(i => i.symbol === symbol);
    return inst?.category?.startsWith('nse_') || 
           inst?.category?.startsWith('mcx_') || 
           inst?.category?.startsWith('bse_');
  }, [allInstruments]);

  // Track if current symbol is Indian (for conditional rendering)
  const currentIsIndian = isIndianSymbol(selectedSymbol);

  /** lightweight-charts data backend: Zerodha / Meta market-data API / Delta history */
  const chartDataSource = useMemo(() => {
    if (!selectedSymbol) return 'metaapi';
    if (currentIsIndian) return 'zerodha';
    const inst = allInstruments.find((i) => i.symbol === selectedSymbol) || {};
    const symU = String(selectedSymbol).toUpperCase();
    const forexSix = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
    const isPerpetualFutures =
      symU.endsWith('USD') &&
      !symU.includes('/') &&
      !forexSix.has(symU) &&
      !symU.includes('XAU') &&
      !symU.includes('XAG');
    const isDeltaInstrument =
      inst.source === 'delta_exchange' ||
      (inst.symbol && (inst.symbol.startsWith('C-') || inst.symbol.startsWith('P-'))) ||
      !!inst.contract_type ||
      isPerpetualFutures;
    if (isDeltaInstrument) return 'delta';
    return 'metaapi';
  }, [selectedSymbol, currentIsIndian, allInstruments]);

  // Re-register Zerodha instrument when user selects a symbol (e.g. after admin cleared subscriptions/cache)
  useEffect(() => {
    if (!selectedSymbol || chartDataSource !== 'zerodha') return;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/zerodha/instruments/subscribe-by-symbol`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: selectedSymbol }),
          signal: ac.signal
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success !== false) {
          zerodhaRefreshStatus?.();
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          /* network / server down — chart may still load from historical if token resolves */
        }
      }
    })();
    return () => ac.abort();
  }, [selectedSymbol, chartDataSource, API_URL, zerodhaRefreshStatus]);

  // TradingView advanced chart handles its own widgets now

  // Get current price for a position (uses spread-adjusted prices from getInstrumentWithLivePrice)
  const getCurrentPrice = (pos) => {
    // Find the instrument and get spread-adjusted live price
    const staticInst = allInstruments.find(i => i.symbol === pos.symbol);
    if (staticInst) {
      const inst = getInstrumentWithLivePrice(staticInst);
      if (inst && (inst.bid > 0 || inst.ask > 0)) {
        // BUY closes at BID, SELL closes at ASK
        return pos.side === 'buy' ? inst.bid : inst.ask;
      }
    }
    return pos.entryPrice || pos.avgPrice;
  };

  /** Same rules as row P/L — used to sum header total without mismatching UserLayout totalPnL. */
  const isIndianPositionPnl = (pos) => {
    const symbol = pos?.symbol || '';
    const posExchange = (pos?.exchange || '').toUpperCase();
    return posExchange === 'NSE' || posExchange === 'BSE' || posExchange === 'NFO' ||
      posExchange === 'BFO' || posExchange === 'MCX' ||
      symbol.includes('NIFTY') || symbol.includes('BANKNIFTY') || symbol.includes('SENSEX') ||
      symbol.includes('FINNIFTY') || symbol.endsWith('CE') || symbol.endsWith('PE') ||
      (!symbol.includes('/') && !symbol.includes('USD') && !symbol.includes('EUR') &&
       !symbol.includes('GBP') && !symbol.includes('JPY') && !symbol.includes('AUD') &&
       !symbol.includes('CAD') && !symbol.includes('CHF') && !symbol.includes('NZD') &&
       !symbol.includes('BTC') && !symbol.includes('ETH') && !symbol.includes('XAU') &&
       !symbol.includes('XAG') && !symbol.includes('US30') && !symbol.includes('US100') &&
       !symbol.includes('US500') && !symbol.includes('UK100'));
  };

  // Calculate profit for position (RAW price P&L — swap/commission shown in separate columns)
  const calculateProfit = (pos) => {
    const currentPrice = getCurrentPrice(pos);
    const entryPrice = pos.entryPrice || pos.avgPrice || 0;
    const priceDiff = pos.side === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
    const symbol = pos.symbol || '';

    if (isIndianPositionPnl(pos)) {
      // Use quantity (= lots × lotSize) directly — mirrors server NettingEngine P/L formula
      const quantity = pos.quantity || (pos.volume * (pos.lotSize || 1)) || 0;
      return priceDiff * quantity;
    }

    // Forex/Crypto/Indices: contract size × lots
    const vol = pos.volume || 0;
    if (symbol.includes('JPY')) return (priceDiff * 100000 * vol) / 100;
    return priceDiff * getContractSize(symbol) * vol;
  };

  // Check if symbol is an Indian instrument
  // Only NSE, BSE, MCX instruments are Indian - everything else (Forex, Crypto, Indices, Stocks) is USD
  const isIndianInstrument = (symbol) => {
    const inst = allInstruments.find(i => i.symbol === symbol);
    // Check category first
    if (inst?.category?.startsWith('nse_') || inst?.category?.startsWith('mcx_') || inst?.category?.startsWith('bse_')) {
      return true;
    }
    // Check symbol patterns for Indian instruments
    return symbol && (
      symbol.includes('NIFTY') || symbol.includes('BANKNIFTY') || 
      symbol.includes('SENSEX') || symbol.includes('FINNIFTY') ||
      symbol.endsWith('FUT') || symbol.endsWith('OPT') ||
      symbol.includes('26') || symbol.includes('25') || // FnO expiry dates
      // Check for common Indian stock patterns (MCX, NSE EQ)
      (symbol.length <= 15 && !symbol.includes('/') && 
       !symbol.includes('USD') && !symbol.includes('EUR') && 
       !symbol.includes('GBP') && !symbol.includes('JPY') && 
       !symbol.includes('AUD') && !symbol.includes('CAD') && 
       !symbol.includes('CHF') && !symbol.includes('NZD') &&
       !symbol.includes('BTC') && !symbol.includes('ETH') &&
       !symbol.includes('XAU') && !symbol.includes('XAG') &&
       !symbol.includes('US30') && !symbol.includes('US100') && 
       !symbol.includes('US500') && !symbol.includes('UK100') &&
       !symbol.includes('DE30') && !symbol.includes('JP225') &&
       !symbol.includes('AAPL') && !symbol.includes('TSLA') &&
       !symbol.includes('GOOGL') && !symbol.includes('AMZN') &&
       !symbol.includes('META') && !symbol.includes('MSFT') &&
       !symbol.includes('NVDA') && !symbol.includes('NFLX'))
    );
  };

  // Format margin — same rules as P/L: Indian margin in INR, international in USD, converted for display toggle
  const formatMargin = (margin, symbol = selectedSymbol) => {
    const m = Number(margin) || 0;
    const rate = usdInrRate + usdMarkup;
    const isIndian = isIndianInstrument(symbol);

    if (isIndian) {
      if (displayCurrency === 'USD') {
        return `$${(m / rate).toFixed(2)}`;
      }
      return `₹${m.toFixed(2)}`;
    }

    if (displayCurrency === 'INR') {
      return `₹${(m * rate).toFixed(2)}`;
    }
    return `$${m.toFixed(2)}`;
  };

  // Format P/L - handles both USD (Forex) and INR (Indian) instruments
  // Respects displayCurrency setting for all instruments
  const formatPnL = (profit, symbol = '') => {
    const sign = profit >= 0 ? '+' : '-';
    const rate = usdInrRate + usdMarkup;
    const isIndian = isIndianInstrument(symbol);
    
    if (isIndian) {
      // Indian instruments - profit is in INR
      if (displayCurrency === 'USD') {
        const usdValue = Math.abs(profit / rate);
        return `${sign}$${usdValue.toFixed(2)}`;
      }
      return `${sign}₹${Math.abs(profit).toFixed(2)}`;
    }
    
    // Forex/Crypto - profit is in USD
    if (displayCurrency === 'INR') {
      const inrValue = Math.abs(profit * rate);
      return `${sign}₹${inrValue.toFixed(2)}`;
    }
    return `${sign}$${Math.abs(profit).toFixed(2)}`;
  };

  // Floating P/L in display currency = sum of row P/L (same formula as table). Not context totalPnL — avoids price-source + FX timing mismatch.
  const rateHdr = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);
  let marketHeaderFloatingPnL = 0;
  for (const pos of positions) {
    if (pos.status === 'closed') continue;
    if (pos.mode === 'binary') continue;
    const raw = calculateProfit(pos);
    if (isIndianPositionPnl(pos)) {
      marketHeaderFloatingPnL += displayCurrency === 'INR' ? raw : raw / rateHdr;
    } else {
      marketHeaderFloatingPnL += displayCurrency === 'INR' ? raw * rateHdr : raw;
    }
  }

  /** B / lot / S / chart row when One Click is on (matches legacy App.jsx market sidebar). */
  const renderOneClickActions = (symbol, opts = {}) => {
    if (!oneClickMode || !symbol) return null;
    const { showTrash = false, mobile = false } = opts;
    const busy = isOneClickSymbolBusy(symbol, oneClickPending);
    const openChart = (e) => {
      e.stopPropagation();
      if (mobile) openMobileInstrumentChartOnly(symbol, e);
      else addChartTab(symbol);
    };
    return (
      <div
        className="trading-actions"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...(busy ? { opacity: 0.92 } : {}),
          ...(mobile ? { paddingLeft: 8, paddingRight: 8, paddingBottom: 6 } : {})
        }}
        title={busy ? 'Order in progress…' : undefined}
      >
        {showTrash && (
          <button
            type="button"
            className="trash-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggleWatchlist(symbol, e);
            }}
            aria-label="Remove from favourites"
          >
            🗑
          </button>
        )}
        <button
          type="button"
          className="buy-btn-small"
          style={getOneClickTradeButtonStyle(symbol, 'buy', oneClickPending)}
          onClick={() => handleExecuteOrder(symbol, 'buy')}
          disabled={busy}
        >
          B
        </button>
        <input
          type="text"
          className="lot-input"
          value={oneClickLotSize}
          disabled={busy}
          onChange={(e) => setOneClickLotSize(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="One-click lot size"
        />
        <button
          type="button"
          className="sell-btn-small"
          style={getOneClickTradeButtonStyle(symbol, 'sell', oneClickPending)}
          onClick={() => handleExecuteOrder(symbol, 'sell')}
          disabled={busy}
        >
          S
        </button>
        <button type="button" className="chart-btn-small" onClick={openChart} aria-label="Open chart">
          +
        </button>
      </div>
    );
  };

  // Filter instruments for mobile search
  const mobileFilteredInstruments = allInstruments.filter(inst => 
    inst && inst.symbol && (
      inst.symbol.toLowerCase().includes(mobileSearchQuery.toLowerCase()) ||
      (inst.name && inst.name.toLowerCase().includes(mobileSearchQuery.toLowerCase()))
    )
  ).slice(0, 20);

  const renderSegmentTabsGroup = () => (
    <div className="segment-tabs-scroll" style={{
      display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px 12px',
      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
      scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch'
    }}>
      <button 
        className={`filter-tab ${filterTab === 'FAVOURITES' ? 'active' : ''}`} 
        onClick={() => setFilterTab('FAVOURITES')}
        style={{ flexShrink: 0, padding: '6px 12px', borderRadius: '16px' }}
      >
        ★ Favourites
      </button>
      {visibleSegmentTabs.map(tab => (
        <button
          key={tab.key}
          className={`filter-tab ${filterTab === tab.key ? 'active' : ''}`}
          onClick={() => setFilterTab(tab.key)}
          style={{ flexShrink: 0, padding: '6px 12px', borderRadius: '16px' }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const renderSegmentTabContent = (isMobile = false) => {
    const listClass = isMobile ? 'mobile-instruments-list' : 'instruments-list';
    const rowClass = isMobile ? 'mobile-instrument-row' : 'instrument-row-detailed';

    if (filterTab === 'FAVOURITES') {
      return (
        <div className={listClass}>
          {watchlist.length > 0 ? watchlist.filter(symbol => !searchQuery || symbol.toLowerCase().includes(searchQuery.toLowerCase())).map(symbol => {
            let staticInst = allInstruments.find(i => i.symbol === symbol);
            if (!staticInst) {
              const brokerInst = getBrokerInstrument ? getBrokerInstrument(symbol) : null;
              if (brokerInst) {
                staticInst = { symbol: brokerInst.symbol, name: brokerInst.name, category: brokerInst.category };
              } else {
                const livePrice = livePrices?.[symbol];
                if (livePrice) staticInst = { symbol, name: symbol, category: 'other' };
                else return null;
              }
            }
            const inst = getInstrumentWithLivePrice(staticInst);
            const bid = inst.bid || 0;
            const ask = inst.ask || 0;
            const low = inst.low || 0;
            const high = inst.high || 0;
            const change = inst.change || 0;
            const expiry = staticInst.expiry || inst.expiry;

            if (isMobile) {
              return (
                <div
                  key={symbol}
                  className={`${rowClass} ${selectedSymbol === symbol ? 'selected' : ''}`}
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openMobileChartPanelBelow(symbol)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openMobileChartPanelBelow(symbol);
                      }
                    }}
                    style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                  >
                    <div className="inst-main">
                      <span className="inst-symbol">{symbol}</span>
                      <span className="inst-name">{inst.name || ''}</span>
                    </div>
                    <div className="inst-prices">
                      <span className="bid">{formatPrice(bid, symbol)}</span>
                      {inst.spreadAmount > 0 && <span className="spread-badge-sm" title="Spread">{inst.spreadAmount.toFixed(bid < 10 ? 4 : 2)}</span>}
                      <span className="ask">{formatPrice(ask, symbol)}</span>
                    </div>
                    <div className="mobile-instrument-row-actions">
                      <button type="button" className="mobile-row-chart-btn" onClick={(e) => openMobileInstrumentChartOnly(symbol, e)}>📊</button>
                      <button type="button" className="remove-fav-btn" onClick={(e) => { e.stopPropagation(); toggleWatchlist(symbol, e); }}>★</button>
                    </div>
                  </div>
                  {renderOneClickActions(symbol, { showTrash: true, mobile: true })}
                </div>
              );
            }

            return (
              <div key={symbol} className={`${rowClass} inst-hoverable ${selectedSymbol === inst.symbol ? 'selected' : ''}`} onClick={() => addChartTab(inst.symbol)}>
                <div className="inst-top-row">
                  <div className="inst-left">
                    <span className="inst-symbol">{inst.symbol}</span>
                    <span className={`inst-change ${change >= 0 ? 'positive' : 'negative'}`}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                      {expiry && <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>Exp: {expiry}</span>}
                    </span>
                  </div>
                  <div className="inst-prices inst-prices-default">
                    <div className="price-col bid">
                      <span className="price-value">{formatPrice(bid, inst.symbol)}</span>
                      <span className="price-label">L: {formatPrice(low, inst.symbol)}</span>
                    </div>
                    {inst.spreadAmount > 0 && <span className="spread-badge-sm" title="Spread">{inst.spreadAmount.toFixed(bid < 10 ? 4 : 2)}</span>}
                    <div className="price-col ask">
                      <span className="price-value">{formatPrice(ask, inst.symbol)}</span>
                      <span className="price-label">H: {formatPrice(high, inst.symbol)}</span>
                    </div>
                  </div>
                  <div className="inst-hover-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="inst-fav-btn active"
                      title="Remove from favourites"
                      aria-label="Remove from favourites"
                      onClick={(e) => { e.stopPropagation(); toggleWatchlist(inst.symbol, e); }}
                    >★</button>
                    <button
                      className="inst-sell-btn"
                      onClick={(e) => { e.stopPropagation(); addChartTab(inst.symbol); setOrderSide('sell'); setInstrumentsPanelCollapsed(true); }}
                    >S</button>
                    <button
                      className="inst-buy-btn"
                      onClick={(e) => { e.stopPropagation(); addChartTab(inst.symbol); setOrderSide('buy'); setInstrumentsPanelCollapsed(true); }}
                    >B</button>
                  </div>
                </div>
                {renderOneClickActions(inst.symbol, { showTrash: true })}
              </div>
            );
          }) : <div className="no-favorites" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>No favourites added</div>}
        </div>
      );
    }

    // Otherwise, rendering a specific segment
    const actTab = visibleSegmentTabs.find(t => t.key === filterTab);
    if (!actTab) return <div className={listClass} />;

    const renderInst = (inst, idx) => {
      const pricedInst = getInstrumentWithLivePrice(inst) || inst;
      const bid = pricedInst.bid || pricedInst.mark_price || 0;
      const ask = pricedInst.ask || pricedInst.mark_price || 0;

      const isFav = isInWatchlist(inst.symbol);
      const showRemoveFromSegment = actTab.type === 'indian' || actTab.type === 'delta';

      return isMobile ? (
        <div
          key={inst.symbol + idx}
          className={`${rowClass} ${selectedSymbol === inst.symbol ? 'selected' : ''}`}
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => openMobileChartPanelBelow(inst.symbol)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openMobileChartPanelBelow(inst.symbol);
              }
            }}
            style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
          >
            <div className="inst-main"><span className="inst-symbol">{inst.symbol}</span><span className="inst-name">{inst.name}</span></div>
            <div className="inst-prices"><span className="bid">{bid > 0 ? formatPrice(bid, inst.symbol) : '-'}</span><span className="ask">{ask > 0 ? formatPrice(ask, inst.symbol) : '-'}</span></div>
            <div className="mobile-instrument-row-actions">
              <button type="button" className={`add-fav-btn ${isFav ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleWatchlist(inst.symbol, e); }}>{isFav ? '★' : '☆'}</button>
              {showRemoveFromSegment && (
                <button className="remove-fav-btn" onClick={(e) => { e.stopPropagation(); removeInstrumentFromCategory(inst.symbol, actTab.label); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 16, cursor: 'pointer', padding: '0 8px' }}>✕</button>
              )}
            </div>
          </div>
          {renderOneClickActions(inst.symbol, { showTrash: false, mobile: true })}
        </div>
      ) : (
        <div key={inst.symbol + idx} className={`${rowClass} inst-hoverable ${selectedSymbol === inst.symbol ? 'selected' : ''}`} onClick={() => addChartTab(inst.symbol)}>
          <div className="inst-top-row">
            <div className="inst-left"><span className="inst-symbol">{inst.symbol}</span><span className="inst-name" style={{fontSize: 11, color: 'var(--text-secondary)'}}>{inst.name}</span></div>
            <div className="inst-prices inst-prices-default">
              <div className="price-col bid"><span className="price-value">{bid > 0 ? formatPrice(bid, inst.symbol) : '-'}</span></div>
              <div className="price-col ask"><span className="price-value">{ask > 0 ? formatPrice(ask, inst.symbol) : '-'}</span></div>
            </div>
            <div className="inst-hover-actions" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`inst-fav-btn ${isFav ? 'active' : ''}`}
                title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
                onClick={(e) => { e.stopPropagation(); toggleWatchlist(inst.symbol, e); }}
              >{isFav ? '★' : '☆'}</button>
              <button
                className="inst-sell-btn"
                onClick={(e) => { e.stopPropagation(); addChartTab(inst.symbol); setOrderSide('sell'); setInstrumentsPanelCollapsed(true); }}
              >S</button>
              <button
                className="inst-buy-btn"
                onClick={(e) => { e.stopPropagation(); addChartTab(inst.symbol); setOrderSide('buy'); setInstrumentsPanelCollapsed(true); }}
              >B</button>
            </div>
          </div>
          {renderOneClickActions(inst.symbol, { showTrash: false })}
        </div>
      );
    };

    return (
      <div className={listClass}>
        {actTab.type === 'indian' && (
          <div style={{ padding: '0' }}>
            {(visibleInstrumentsByCategory[actTab.label] || visibleInstrumentsByCategory[actTab.key] || [])
              .filter(i => !inlineIndianQuery || i.symbol.toLowerCase().includes(inlineIndianQuery.toLowerCase()))
              .map(renderInst)}

            {inlineIndianResults.length > 0 && <div style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>SEARCH RESULTS</div>}
            {inlineIndianResults.map(inst => {
              const isAlreadyAdded = (visibleInstrumentsByCategory[actTab.label] || visibleInstrumentsByCategory[actTab.key] || []).some(i => i.symbol === inst.symbol);
              return (
              <div key={inst.token} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{inst.symbol}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{inst.name} {inst.expiry && `• Exp: ${inst.expiry}`}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button disabled={isAlreadyAdded} onClick={() => { addZerodhaInstrument(inst, actTab.label); isMobile ? openMobileChartPanelBelow(inst.symbol) : addChartTab(inst.symbol); }} style={{ padding: '4px 8px', background: isAlreadyAdded ? 'var(--bg-secondary)' : 'var(--accent)', color: isAlreadyAdded ? 'var(--text-secondary)' : 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: isAlreadyAdded ? 'default' : 'pointer' }}>{isAlreadyAdded ? 'Added' : '+ Add'}</button>
                </div>
              </div>
            )})}
          </div>
        )}

        {actTab.type === 'international' && (
          <div style={{ padding: '0' }}>
            {brokerSearchModalVisibility.filterInternationalInstrumentList(getBrokerByCategory(actTab.key)).filter(i => !searchQuery || i.symbol.toLowerCase().includes(searchQuery.toLowerCase())).map(renderInst)}
          </div>
        )}

        {actTab.type === 'delta' && (
          <div style={{ padding: '0' }}>
            {(visibleInstrumentsByCategory[actTab.label] || visibleInstrumentsByCategory[actTab.key] || [])
              .filter(i => !inlineDeltaQuery || i.symbol.toLowerCase().includes(inlineDeltaQuery.toLowerCase()))
              .map(renderInst)}

            {inlineDeltaLoading ? <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div> : 
             (inlineDeltaResults.length > 0 && (
               <>
                 <div style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>SEARCH RESULTS</div>
                 {inlineDeltaResults.slice(0, 50).map((inst, idx) => {
                    const isAlreadyAdded = (visibleInstrumentsByCategory[actTab.label] || visibleInstrumentsByCategory[actTab.key] || []).some(i => i.symbol === inst.symbol);
                    return (
                    <div key={inst.symbol + idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{inst.symbol}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{inst.name}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button disabled={isAlreadyAdded} onClick={() => { addDeltaInstrumentToWatchlist(inst, actTab.label); isMobile ? openMobileChartPanelBelow(inst.symbol) : addChartTab(inst.symbol); }} style={{ padding: '4px 8px', background: isAlreadyAdded ? 'var(--bg-secondary)' : 'var(--accent)', color: isAlreadyAdded ? 'var(--text-secondary)' : 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: isAlreadyAdded ? 'default' : 'pointer' }}>{isAlreadyAdded ? 'Added' : '+ Add'}</button>
                      </div>
                    </div>
                 )})}
               </>
             ))
            }
          </div>
        )}
      </div>
    );
  };

  const renderDynamicTopSearchArea = (isMobile = false) => {
    if (filterTab === 'FAVOURITES') {
      return (
        <div className="unified-search-box">
          <svg className="unified-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            className="unified-search-input"
            placeholder="Search favourites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && <button className="unified-search-clear" onClick={() => setSearchQuery('')}>✕</button>}
        </div>
      );
    }
    const actTab = visibleSegmentTabs.find(t => t.key === filterTab);
    if (!actTab) return null;

    if (actTab.type === 'indian') {
      return (
        <div className="unified-search-box">
          <svg className="unified-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            className="unified-search-input"
            placeholder={`Search ${actTab.label}...`}
            value={inlineIndianQuery}
            onChange={e => setInlineIndianQuery(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && performInlineIndianSearch(inlineIndianQuery, actTab.key)}
          />
          <button
            className="unified-search-go"
            onClick={() => performInlineIndianSearch(inlineIndianQuery, actTab.key)}
            disabled={inlineIndianSearching || inlineIndianQuery.length < 2}
          >{inlineIndianSearching ? '…' : 'Go'}</button>
        </div>
      );
    }

    if (actTab.type === 'delta') {
      return (
        <div className="unified-search-box">
          <svg className="unified-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            className="unified-search-input"
            placeholder={`Search ${actTab.label}...`}
            value={inlineDeltaQuery}
            onChange={e => { setInlineDeltaQuery(e.target.value); performInlineDeltaSearch(e.target.value, actTab.key); }}
          />
          {inlineDeltaQuery && <button className="unified-search-clear" onClick={() => setInlineDeltaQuery('')}>✕</button>}
        </div>
      );
    }

    // International (Forex, Metals, Indices, Crypto)
    const intlQuery = isMobile ? mobileSearchQuery : searchQuery;
    const setIntlQuery = isMobile ? setMobileSearchQuery : setSearchQuery;
    return (
      <div className="unified-search-box">
        <svg className="unified-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          type="text"
          className="unified-search-input"
          placeholder="Search eg: EUR/USD, Gold, BTC..."
          value={intlQuery}
          onChange={(e) => setIntlQuery(e.target.value)}
        />
        {intlQuery && <button className="unified-search-clear" onClick={() => setIntlQuery('')}>✕</button>}
      </div>
    );
  };

  const renderOrderPanelContents = () => (
    <>
        {/* Symbol/price header row removed — the prices are already shown
            on the SELL/BUY action buttons below, no need to duplicate them. */}

        {/* Trading mode tabs hidden — platform is netting-only */}

        {/* HEDGING MODE */}
        {tradingMode === 'hedging' && (
          <>
            <div
              className={isPlacingOrder ? 'order-panel-executing' : undefined}
              aria-busy={isPlacingOrder}
              title={isPlacingOrder ? 'Order in progress…' : undefined}
            >
            <div className="order-type-tabs">
              <button className={`type-tab ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Market</button>
              <button className={`type-tab ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>Limit</button>
              <button className={`type-tab ${orderType === 'stop' ? 'active' : ''}`} onClick={() => setOrderType('stop')}>Stop</button>
            </div>
            <div className="price-buttons">
              <button className={`price-btn sell ${orderSide === 'sell' ? 'active' : ''}`} onClick={() => setOrderSide('sell')}>
                <span className="side-label">SELL</span>
                <span className="side-price" style={{ fontSize: getPriceFontSize(selectedInstrument.bid || 0, selectedSymbol) }}>{formatPrice(selectedInstrument.bid || 0, selectedSymbol)}</span>
              </button>
              {selectedInstrument.spreadAmount > 0 && (
                <span className="spread-badge" title="Spread">{selectedInstrument.spreadAmount.toFixed(selectedInstrument.bid < 10 ? 4 : 2)}</span>
              )}
              <button className={`price-btn buy ${orderSide === 'buy' ? 'active' : ''}`} onClick={() => setOrderSide('buy')}>
                <span className="side-label">BUY</span>
                <span className="side-price" style={{ fontSize: getPriceFontSize(selectedInstrument.ask || 0, selectedSymbol) }}>{formatPrice(selectedInstrument.ask || 0, selectedSymbol)}</span>
              </button>
            </div>
            {orderType !== 'market' && (
              <div className="order-input-group">
                <label>{orderType === 'limit' ? 'Limit Price' : 'Stop Price'}</label>
                <input type="number" step="0.01" value={orderType === 'limit' ? limitPrice : stopPrice} onChange={(e) => orderType === 'limit' ? setLimitPrice(e.target.value) : setStopPrice(e.target.value)} placeholder={(entryPrice || 0).toFixed(2)} />
              </div>
            )}
            <div className="order-input-group">
              <label>Volume (Lots)</label>
              <div className="volume-control">
                <button type="button" onClick={() => setVolume(prev => Math.max(0.01, parseFloat(((parseFloat(prev) || 0.01) - 0.01).toFixed(6))).toString())}>−</button>
                <input type="text" inputMode="decimal" value={volume} onChange={(e) => { const val = e.target.value; if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) setVolume(val); }} onBlur={(e) => { const val = parseFloat(e.target.value); if (e.target.value !== '' && !Number.isNaN(val)) setVolume(String(parseFloat(val.toFixed(6)))); }} />
                <button type="button" onClick={() => setVolume(prev => parseFloat(((parseFloat(prev) || 0.01) + 0.01).toFixed(6)).toString())}>+</button>
              </div>
              <span className="volume-hint" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{(parseFloat(volume) || 0.01).toFixed(4)} lots</span>
            </div>
            <div className="order-input-group">
              <label>Leverage</label>
              <select value={leverage} onChange={(e) => setLeverage(parseInt(e.target.value))}>
                {defaultLeverageOptions.map(lev => (
                  <option key={lev} value={lev}>1:{lev}</option>
                ))}
              </select>
              <div className="margin-info"><span>Required Margin: {formatMargin(marginRequired)}</span></div>
            </div>
            <div className="order-input-group sl-tp">
              <label>Stop Loss</label>
              <div className="sl-tp-row">
                <input type="number" step="0.01" value={stopLoss || calculateSlPrice()} onChange={(e) => setStopLoss(e.target.value)} />
                <div className="pips-control">
                  <button onClick={() => setSlPips(Math.max(0, slPips - 10))}>−</button>
                  <span>{slPips}p</span>
                  <button onClick={() => setSlPips(slPips + 10)}>+</button>
                </div>
              </div>
            </div>
            <div className="order-input-group sl-tp">
              <label>Take Profit</label>
              <div className="sl-tp-row">
                <input type="number" step="0.01" value={takeProfit || calculateTpPrice()} onChange={(e) => setTakeProfit(e.target.value)} />
                <div className="pips-control">
                  <button onClick={() => setTpPips(Math.max(0, tpPips - 10))}>−</button>
                  <span>{tpPips}p</span>
                  <button onClick={() => setTpPips(tpPips + 10)}>+</button>
                </div>
              </div>
            </div>
            </div>
            {!lotOrderValidation.valid && lotOrderValidation.messages.length > 0 && (
              <div className="order-validation-warn" role="alert">
                {lotOrderValidation.messages.map((m, i) => (
                  <div key={i}>{m}</div>
                ))}
              </div>
            )}
            <button
              className={`order-submit-btn ${orderSide} ${isPlacingOrder ? 'order-pending' : ''} ${!lotOrderValidation.canSubmit && !isPlacingOrder ? 'order-submit-invalid' : ''}`}
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || !lotOrderValidation.canSubmit}
              title={!lotOrderValidation.canSubmit && !isPlacingOrder ? lotOrderValidation.messages.join(' ') : undefined}
            >
              {orderSide === 'buy' ? 'Open BUY Position' : 'Open SELL Position'}
            </button>
          </>
        )}

        {/* NETTING MODE */}
        {tradingMode === 'netting' && (
          <>
            <div
              className={isPlacingOrder ? 'order-panel-executing' : undefined}
              aria-busy={isPlacingOrder}
              title={isPlacingOrder ? 'Order in progress…' : undefined}
            >
            {nettingSegmentBlockMessage && (
              <div className="order-validation-warn" role="alert" style={{ margin: '0 0 12px' }}>
                {nettingSegmentBlockMessage}
              </div>
            )}
            {/* STEP 1 — BUY / SELL broad buttons */}
            <div className="price-buttons">
              <button className={`price-btn sell ${orderSide === 'sell' ? 'active' : ''}`} onClick={() => setOrderSide('sell')}>
                <span className="side-label">SELL</span>
                <span className="side-price" style={{ fontSize: getPriceFontSize(selectedInstrument.bid || 0, selectedSymbol) }}>{formatPrice(selectedInstrument.bid || 0, selectedSymbol)}</span>
              </button>
              {selectedInstrument.spreadAmount > 0 && (
                <span className="spread-badge" title="Spread">{selectedInstrument.spreadAmount.toFixed(selectedInstrument.bid < 10 ? 4 : 2)}</span>
              )}
              <button className={`price-btn buy ${orderSide === 'buy' ? 'active' : ''}`} onClick={() => setOrderSide('buy')}>
                <span className="side-label">BUY</span>
                <span className="side-price" style={{ fontSize: getPriceFontSize(selectedInstrument.ask || 0, selectedSymbol) }}>{formatPrice(selectedInstrument.ask || 0, selectedSymbol)}</span>
              </button>
            </div>
            {/* STEP 2 — Order Type Dropdown */}
            <div className="order-type-dropdown-wrap">
              <div className="order-type-dropdown-trigger" onClick={() => setShowOrderTypeMenu(v => !v)}>
                <span>{orderType === 'market' ? 'Market' : orderType === 'limit' ? 'Limit' : 'SL-M (Stop Limit)'}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showOrderTypeMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {showOrderTypeMenu && (
                <div className="order-type-dropdown-menu">
                  {[['market','Market'],['limit','Limit'],['slm','SL-M (Stop Limit)']].map(([key, label]) => (
                    <button key={key} className={`order-type-dropdown-item${orderType === key ? ' active' : ''}`}
                      onClick={() => { setOrderType(key); setShowOrderTypeMenu(false); }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {orderType !== 'market' && (
              <div className="order-input-group">
                <label>
                  {orderType === 'limit' ? 'Limit Price' : 'Trigger Price'}
                </label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={limitPrice} 
                  onChange={(e) => setLimitPrice(e.target.value)} 
                  placeholder={(() => {
                    const price = entryPrice || 0;
                    if (orderType === 'limit') {
                      const band = getNettingLimitAwayOffset(price, segmentSettings);
                      if (!band) return formatPrice(price, selectedSymbol);
                      const suggestedPrice = orderSide === 'buy' ? price - band.away : price + band.away;
                      return formatPrice(suggestedPrice, selectedSymbol);
                    }
                    // SL-M / Stop: use same offset logic as limit
                    const band = getNettingStopSlmAwayOffset(price, segmentSettings);
                    if (!band) return formatPrice(price, selectedSymbol);
                    const suggestedPrice = orderSide === 'buy' ? price + band.away : price - band.away;
                    return formatPrice(suggestedPrice, selectedSymbol);
                  })()}
                />
                {(() => {
                  const price = entryPrice || 0;
                  if (orderType === 'limit') {
                    const band = getNettingLimitAwayOffset(price, segmentSettings);
                    if (!band) return null;
                    return (
                      <span style={{ fontSize: '10px', color: '#71717a', marginTop: '4px', display: 'block' }}>
                        {orderSide === 'buy'
                          ? `Between ${formatPrice(price - band.away, selectedSymbol)} and market (${band.detail})`
                          : `Between market and ${formatPrice(price + band.away, selectedSymbol)} (${band.detail})`}
                      </span>
                    );
                  }
                  // SL-M / Stop: show "Between" hint like limit
                  const band = getNettingStopSlmAwayOffset(price, segmentSettings);
                  if (!band) return null;
                  return (
                    <span style={{ fontSize: '10px', color: '#71717a', marginTop: '4px', display: 'block' }}>
                      {orderSide === 'buy'
                        ? `Between market and ${formatPrice(price + band.away, selectedSymbol)} (${band.detail})`
                        : `Between ${formatPrice(price - band.away, selectedSymbol)} and market (${band.detail})`}
                    </span>
                  );
                })()}
              </div>
            )}
            <div className="order-input-group">
              <label>{volumeFieldLabel}</label>
              <div className="volume-control">
                <button
                  type="button"
                  onClick={() =>
                    setVolume((prev) => {
                      const cur = parseFloat(prev) || (nettingVolumeIsShares ? 1 : 0.01);
                      if (nettingVolumeIsShares) {
                        return String(Math.max(1, Math.round(cur) - 1));
                      }
                      return Math.max(0.01, parseFloat((cur - 0.01).toFixed(6))).toFixed(6);
                    })
                  }
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode={nettingVolumeIsShares ? 'numeric' : 'decimal'}
                  value={volume}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (nettingVolumeIsShares) {
                      if (val === '' || /^\d+$/.test(val)) setVolume(val);
                      return;
                    }
                    if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) setVolume(val);
                  }}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (e.target.value === '' || Number.isNaN(val)) return;
                    if (nettingVolumeIsShares) {
                      setVolume(String(Math.max(1, Math.round(val))));
                      return;
                    }
                    setVolume(String(parseFloat(val.toFixed(6))));
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setVolume((prev) => {
                      const cur = parseFloat(prev) || (nettingVolumeIsShares ? 1 : 0.01);
                      if (nettingVolumeIsShares) {
                        return String(Math.round(cur) + 1);
                      }
                      return parseFloat((cur + 0.01).toFixed(6)).toFixed(6);
                    })
                  }
                >
                  +
                </button>
              </div>
              <span className="volume-hint">
                {nettingVolumeIsShares
                  ? `${Math.round(parseFloat(volume) || 1)} ${volumeUnitPlural}`
                  : `${(parseFloat(volume) || 0.01).toFixed(4)} ${volumeUnitPlural}`}
              </span>
              {/* F&O / indices: show exchange contract size (lots mode). Cash equity: lot size = shares per lot when applicable */}
              {Number(selectedInstrument?.lotSize) > 1 && (
                <div className="lot-size-info" style={{ marginTop: '6px', padding: '8px 10px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                  <span style={{ color: '#3b82f6', fontSize: '12px', fontWeight: '500' }}>
                    1 lot = {selectedInstrument.lotSize} units (index points / Qty per exchange)
                  </span>
                  <span style={{ color: '#888', fontSize: '11px', marginLeft: '8px' }}>
                    {nettingVolumeIsShares
                      ? `Total: ${Math.round((parseFloat(volume) || 1) * selectedInstrument.lotSize)} shares`
                      : `Total contracts: ${(parseFloat(volume) || 0) * selectedInstrument.lotSize}`}
                  </span>
                </div>
              )}
            </div>
            {['NSE_OPT', 'BSE_OPT', 'MCX_OPT'].includes(resolvedSegmentApiName) &&
              segmentSettings &&
              (() => {
                let strikePx = selectedInstrument?.strike || 0;
                const um = selectedSymbol.match(/^([A-Z]+)/i);
                const undSym = um ? um[1] : '';
                if (!strikePx) {
                  const symU = selectedSymbol.toUpperCase();
                  const rest = symU.replace(/^[A-Z]+/, '');
                  if (rest.length >= 7) {
                    const afterDate = rest.substring(5);
                    const sm = afterDate.match(/^(\d+)([CP]E)$/);
                    if (sm) strikePx = parseInt(sm[1], 10);
                  }
                }
                let undPx = 0;
                const variants = [undSym, `${undSym}FUT`, `${undSym}26MARFUT`, `${undSym}24MARFUT`].filter(Boolean);
                if (getTickBySymbolAuto) {
                  for (const v of variants) {
                    const t = getTickBySymbolAuto(v);
                    if (t?.lastPrice > 0) {
                      undPx = t.lastPrice;
                      break;
                    }
                  }
                }
                if (undPx === 0) {
                  for (const v of variants) {
                    if (livePrices[v]?.bid > 0) {
                      undPx = livePrices[v].bid;
                      break;
                    }
                  }
                }
                const hasRule =
                  (segmentSettings.buyingStrikeFar > 0 ||
                    segmentSettings.buyingStrikeFarPercent > 0 ||
                    segmentSettings.sellingStrikeFar > 0 ||
                    segmentSettings.sellingStrikeFarPercent > 0);
                if (!hasRule) return null;
                const band =
                  undPx > 0 && strikePx > 0
                    ? getOptionsStrikeMaxDistance(undPx, segmentSettings, orderSide)
                    : null;
                const dist =
                  undPx > 0 && strikePx > 0 ? Math.abs(strikePx - undPx) : null;
                return (
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#a1a1aa',
                      marginBottom: '10px',
                      padding: '8px 10px',
                      background: 'rgba(39, 39, 42, 0.6)',
                      borderRadius: '6px',
                      lineHeight: 1.45
                    }}
                  >
                    <strong style={{ color: '#e4e4e7' }}>Strike vs underlying (index)</strong>
                    <span style={{ display: 'block', marginTop: 2, fontSize: '10px', color: '#71717a' }}>
                      Uses option <strong style={{ color: '#a1a1aa' }}>strike</strong> ({strikePx || '—'}) vs{' '}
                      <strong style={{ color: '#a1a1aa' }}>underlying LTP</strong> — not the option premium (chart price).
                    </span>
                    {band && dist != null ? (
                      <>
                        {' '}
                        Strike {strikePx}, underlying ~{undPx.toFixed(2)}, |Δ|={dist.toFixed(0)}. Max for{' '}
                        {orderSide} ({band.detail}): {band.max.toFixed(2)}.
                        {dist > band.max ? (
                          <span style={{ color: '#f87171', display: 'block', marginTop: 4 }}>
                            Outside allowed band (server will reject).
                          </span>
                        ) : (
                          <span style={{ color: '#86efac', display: 'block', marginTop: 4 }}>
                            Within allowed band.
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ display: 'block', marginTop: 4 }}>
                        Underlying LTP not loaded — add <strong style={{ color: '#e4e4e7' }}>{undSym || 'index'}</strong> (or
                        future) to the watchlist so % strike limits can run. Until then the server may skip the rule.
                      </span>
                    )}
                  </div>
                );
              })()}
            <div className="order-input-group sl-tp">
              <div 
                className="collapsible-label" 
                onClick={() => setShowStopLoss(!showStopLoss)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0' }}
              >
                <label style={{ cursor: 'pointer', margin: 0 }}>Stop Loss</label>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{showStopLoss ? '▲' : '▼'}</span>
              </div>
              {showStopLoss && (
                <input type="number" step="0.01" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="Optional" />
              )}
            </div>
            <div className="order-input-group sl-tp">
              <div 
                className="collapsible-label" 
                onClick={() => setShowTakeProfit(!showTakeProfit)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0' }}
              >
                <label style={{ cursor: 'pointer', margin: 0 }}>Target Price</label>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{showTakeProfit ? '▲' : '▼'}</span>
              </div>
              {showTakeProfit && (
                <input type="number" step="0.01" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="Optional" />
              )}
            </div>
            {/* STEP 6 — Intraday / Carry Forward */}
            <div className="order-session-row">
              <button className={`session-tab-btn${orderSession === 'intraday' ? ' active intraday' : ''}`} onClick={() => setOrderSession('intraday')}>
                Intraday
              </button>
              <button
                type="button"
                className={`session-tab-btn${orderSession === 'carryforward' ? ' active carryforward' : ''}`}
                disabled={overnightDisabled}
                title={overnightDisabled ? 'Overnight / carry forward is off for this segment.' : undefined}
                onClick={() => !overnightDisabled && setOrderSession('carryforward')}
              >
                Carry Forward
              </button>
            </div>
            {overnightDisabled && (
              <p className="session-hint" style={{ fontSize: '11px', color: '#a1a1aa', margin: '4px 0 8px' }}>
                Carry forward disabled — intraday only.
              </p>
            )}
            {/* Margin % Buttons — shown only when leverage actually affects the calculation */}
            {(() => {
              const isTimesM = tradingMode === 'netting' && segmentSettings?.marginCalcMode === 'times';
              const timesX = isTimesM ? getSegmentMarginX() : 0;

              // In netting mode, leverage buttons only apply to Times mode (position cap).
              // Fixed/Percent admin margins are set values — leverage has no effect.
              // Hedging always uses leverage.
              if (tradingMode === 'netting' && !isTimesM) return null;

              // For Times mode: percentage applies to multiplier (25% of 500X = 125X)
              const effectiveMultiplier = isTimesM && timesX > 0 ? Math.round(timesX * leverage / 100) : 0;
              const label = isTimesM && timesX > 0 ? `Leverage (${timesX}X max)` : 'Margin % (Effective Leverage)';
              
              return (
                <div className="order-input-group sl-tp">
                  <div
                    className="collapsible-label"
                    onClick={() => setShowPositionSize(v => !v)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0' }}
                  >
                    <label style={{ cursor: 'pointer', margin: 0 }}>{label}</label>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{showPositionSize ? '▲' : '▼'}</span>
                  </div>
                  {showPositionSize && (<>
                    <div className="margin-buttons" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {[25, 50, 75, 100].map(mp => {
                        // For Times mode: show effective multiplier (25% of 500X = 125X)
                        const effX = isTimesM && timesX > 0 ? Math.round(timesX * mp / 100) : 0;
                        const sublabel = isTimesM && timesX > 0
                          ? `${effX}X`
                          : `(~1:${(Math.round(10000 / mp) / 100).toFixed((Math.round(10000 / mp) / 100) % 1 === 0 ? 0 : 2)}x)`;
                        return (
                          <button
                            key={mp}
                            className={`margin-btn ${leverage === mp ? 'active' : ''}`}
                            onClick={() => setLeverage(mp)}
                            style={{
                              flex: '1 1 45%',
                              padding: '8px 4px',
                              background: leverage === mp ? 'var(--accent)' : 'var(--bg-secondary)',
                              color: leverage === mp ? 'white' : 'var(--text-primary)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              fontSize: '13px',
                              cursor: 'pointer'
                            }}
                          >
                            {mp}% <span style={{ opacity: 0.8, fontSize: '11px' }}>{sublabel}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="margin-info" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {isTimesM && timesX > 0
                        ? `Margin: ${formatMargin(calculateRequiredMargin())} | Effective leverage: ${effectiveMultiplier}X`
                        : `Margin: ${formatMargin(calculateRequiredMargin())} | Effective: 1:${Math.round(10000 / leverage) / 100}x leverage`}
                    </div>
                  </>)}
                </div>
              );
            })()}
            </div>
            {!lotOrderValidation.valid && lotOrderValidation.messages.length > 0 && (
              <div className="order-validation-warn" role="alert">
                {lotOrderValidation.messages.map((m, i) => (
                  <div key={i}>{m}</div>
                ))}
              </div>
            )}
            {/* STEP 7 — Open Order Button */}
            <button
              className={`order-submit-btn ${orderSide} ${isPlacingOrder ? 'order-pending' : ''} ${!lotOrderValidation.canSubmit && !isPlacingOrder ? 'order-submit-invalid' : ''}`}
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || !lotOrderValidation.canSubmit}
              title={!lotOrderValidation.canSubmit && !isPlacingOrder ? lotOrderValidation.messages.join(' ') : undefined}
            >
              Open {orderSide === 'buy' ? 'BUY' : 'SELL'} Order
            </button>
            {/* STEP 8 — Info box: Session / Margin Mode / Required Margin */}
            <div className="order-info-box">
              <div className="order-info-row">
                <span className="order-info-key">Session</span>
                <span className="order-info-chip">{orderSession === 'intraday' ? 'Intraday (Auto SqOff)' : 'Carry Forward'}</span>
              </div>
              {tradingMode === 'netting' && segmentSettings && (() => {
                const mode = segmentSettings.marginCalcMode;
                const X = getSegmentMarginX();
                const currSym = '₹';
                let modeLabel, modeColor;
                if (mode === 'times') {
                  modeLabel = `Times — ${X > 0 ? `${X}X` : 'not set'}`;
                  modeColor = '#a78bfa';
                } else if (mode === 'percent') {
                  modeLabel = `Percent — ${X > 0 ? `${X}%` : 'not set'}`;
                  modeColor = '#f59e0b';
                } else {
                  modeLabel = `Fixed — ${X > 0 ? `${currSym}${X}/lot` : 'not set'}`;
                  modeColor = '#94a3b8';
                }
                return (
                  <div className="order-info-row">
                    <span className="order-info-key">Margin Mode</span>
                    <span className="order-info-val" style={{ color: modeColor, fontWeight: 600 }}>{modeLabel}</span>
                  </div>
                );
              })()}
              <div className="order-info-row">
                <span className="order-info-key">Required Margin</span>
                <span className="order-info-margin">{formatMargin(calculateRequiredMargin())}</span>
              </div>
              {tradingMode === 'netting' && segmentSettings?.marginCalcMode === 'times' && (() => {
                const X = getSegmentMarginX();
                if (!(X > 0)) return null;
                const effectiveX = Math.round(X * leverage / 100);
                return (<>
                  <div className="order-info-row"><span className="order-info-key">Max Multiplier</span><span className="order-info-val" style={{ color: '#a78bfa', fontWeight: 600 }}>{X}X</span></div>
                  <div className="order-info-row"><span className="order-info-key">Effective ({leverage}%)</span><span className="order-info-val" style={{ color: '#22c55e', fontWeight: 600 }}>{effectiveX}X</span></div>
                </>);
              })()}
              {selectedInstrument?.lotSize > 1 && (
                <div className="order-info-row"><span className="order-info-key">Total Value</span><span className="order-info-val">{formatMargin(volumeNum * selectedInstrument.lotSize * entryPrice)}</span></div>
              )}
            </div>
          </>
        )}

        {/* BINARY MODE */}
        {tradingMode === 'binary' && (
          <>
            <div
              className={isPlacingOrder ? 'order-panel-executing' : undefined}
              aria-busy={isPlacingOrder}
              title={isPlacingOrder ? 'Order in progress…' : undefined}
            >
            <div className="binary-price-display">
              <span className="current-price-label">Current Price</span>
              <span className="current-price-value">{formatPrice(selectedInstrument.bid || 0, selectedSymbol)}</span>
            </div>
            <div className="binary-direction-buttons">
              <button className={`binary-btn up ${binaryDirection === 'up' ? 'active' : ''}`} onClick={() => setBinaryDirection('up')}>
                <span className="arrow">▲</span>
                <span>UP</span>
              </button>
              <button className={`binary-btn down ${binaryDirection === 'down' ? 'active' : ''}`} onClick={() => setBinaryDirection('down')}>
                <span className="arrow">▼</span>
                <span>DOWN</span>
              </button>
            </div>
            <div className="order-input-group">
              <label>
                Trade Amount ({displayCurrency === 'INR' ? '₹' : '$'}) — limits ₹{binaryStakeMeta.minInr}–₹
                {binaryStakeMeta.maxInr}
              </label>
              <div className="volume-control">
                <button
                  type="button"
                  onClick={() => setBinaryAmount((a) => clampBinaryStakeDisplay(a - binaryStakeMeta.stepDisp))}
                >
                  −
                </button>
                <input
                  type="number"
                  min={binaryStakeMeta.minDisp}
                  max={binaryStakeMeta.maxDisp}
                  step={displayCurrency === 'INR' ? 1 : 'any'}
                  value={binaryAmount}
                  onChange={(e) => {
                    const raw = displayCurrency === 'INR' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                    if (!Number.isFinite(raw)) {
                      setBinaryAmount(clampBinaryStakeDisplay(binaryStakeMeta.minDisp));
                      return;
                    }
                    setBinaryAmount(clampBinaryStakeDisplay(raw));
                  }}
                />
                <button
                  type="button"
                  onClick={() => setBinaryAmount((a) => clampBinaryStakeDisplay(a + binaryStakeMeta.stepDisp))}
                >
                  +
                </button>
              </div>
            </div>
            <div className="order-input-group">
              <label>Expiry Time</label>
              <div className="expiry-selector">
                <div className="expiry-quick-options">
                  {(binarySettings?.allowedExpiries || [60, 300, 900, 3600]).map(expiry => {
                    // Format expiry label
                    let label;
                    if (expiry >= 86400) label = `${Math.floor(expiry / 86400)}d`;
                    else if (expiry >= 3600) label = `${Math.floor(expiry / 3600)}h`;
                    else if (expiry >= 60) label = `${Math.floor(expiry / 60)}m`;
                    else label = `${expiry}s`;
                    return (
                      <button 
                        key={expiry}
                        className={`expiry-btn ${binaryExpiry === expiry ? 'active' : ''}`} 
                        onClick={() => setBinaryExpiry(expiry)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="binary-payout-info">
              <div className="payout-row"><span>If you win:</span><span className="win-amount">+{displayCurrency === 'INR' ? '₹' : '$'}{(binaryAmount * (binarySettings?.payoutPercent || 85) / 100).toFixed(2)}</span></div>
              <div className="payout-row"><span>If you lose:</span><span className="lose-amount">-{displayCurrency === 'INR' ? '₹' : '$'}{binaryAmount.toFixed(2)}</span></div>
            </div>
            </div>
            {!lotOrderValidation.canSubmit && lotOrderValidation.messages.length > 0 && (
              <div className="order-validation-msgs" style={{ marginBottom: 8, fontSize: 12, color: 'var(--error, #ef4444)' }}>
                {lotOrderValidation.messages.map((m, i) => (
                  <div key={i}>{m}</div>
                ))}
              </div>
            )}
            <button
              className={`order-submit-btn binary ${binaryDirection} ${isPlacingOrder ? 'order-pending' : ''} ${!lotOrderValidation.canSubmit && !isPlacingOrder ? 'order-submit-invalid' : ''}`}
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || !lotOrderValidation.canSubmit}
              title={!lotOrderValidation.canSubmit && !isPlacingOrder ? lotOrderValidation.messages.join(' ') : undefined}
            >
              <>Trade {binaryDirection.toUpperCase()} - {displayCurrency === 'INR' ? '₹' : '$'}{binaryAmount}</>
            </button>
            <div className="binary-timer-info">
              <span>Trade expires in {binaryExpiry >= 3600 ? `${Math.floor(binaryExpiry / 3600)}h ${Math.floor((binaryExpiry % 3600) / 60)}m` : `${Math.floor(binaryExpiry / 60)}m ${binaryExpiry % 60}s`}</span>
            </div>
          </>
        )}

        <div className="order-summary">
          {tradingMode === 'hedging' && <span>{volumeNum.toFixed(2)} lots @ {formatPrice(entryPrice, selectedSymbol)}</span>}
          {tradingMode === 'netting' && (
            <span>
              {nettingVolumeIsShares ? volumeNum : volumeNum.toFixed(2)} {volumeUnitPlural} @{' '}
              {formatPrice(entryPrice, selectedSymbol)} ({orderSession})
            </span>
          )}
          {tradingMode === 'binary' && <span>{displayCurrency === 'INR' ? '₹' : '$'}{binaryAmount} on {binaryDirection.toUpperCase()} - {binaryExpiry >= 3600 ? `${Math.floor(binaryExpiry / 3600)}h` : `${Math.floor(binaryExpiry / 60)}m`} expiry</span>}
        </div>
    </>
  );

  const openMobileChartPanelBelow = (symbol) => {
    addChartTab(symbol);
    setMobileMarketTab('instruments');
    setMobileShowChartBelow(true);
  };

  const openMobileInstrumentChartOnly = (symbol, e) => {
    e?.stopPropagation();
    addChartTab(symbol);
    setMobileMarketTab('chart');
    setMobileShowChartBelow(false);
  };

  return (
    <div className="market-page-root">
      {/* Mobile Market Tabs */}
      <div className="mobile-market-tabs">
        <button 
          className={`mobile-market-tab ${mobileMarketTab === 'instruments' ? 'active' : ''}`}
          onClick={() => setMobileMarketTab('instruments')}
        >
          <span className="tab-icon">📑</span>
          <span>Symbols</span>
        </button>
        <button 
          className={`mobile-market-tab ${mobileMarketTab === 'chart' ? 'active' : ''}`}
          onClick={() => {
            setMobileMarketTab('chart');
            setMobileShowChartBelow(false);
          }}
        >
          <span className="tab-icon">📊</span>
          <span>Chart</span>
        </button>
        <button 
          className={`mobile-market-tab ${mobileMarketTab === 'history' ? 'active' : ''}`}
          onClick={() => {
            setMobileMarketTab('history');
            setMobileShowChartBelow(false);
          }}
        >
          <span className="tab-icon">📋</span>
          <span>Positions</span>
        </button>
      </div>
      
      {/* Mobile Instruments Section */}
      <div className={`market-section instruments-section ${mobileMarketTab === 'instruments' ? 'active' : ''}`}>
        <div className="mobile-instruments-content">
          {renderDynamicTopSearchArea(true)}
          {renderSegmentTabsGroup()}
          {renderSegmentTabContent(true)}
        </div>
        {mobileShowChartBelow && (
          <div className="mobile-chart-below">
            <div className="mobile-chart-below-head">
              <span className="mobile-chart-below-title">
                Order
                <strong>{selectedSymbol}</strong>
              </span>
              <button
                type="button"
                className="mobile-chart-below-close"
                onClick={() => setMobileShowChartBelow(false)}
                aria-label="Close order panel"
              >
                ✕
              </button>
            </div>
            <div className="order-panel mobile-order-embedded">
              {renderOrderPanelContents()}
            </div>
          </div>
        )}
      </div>


      {/* Mobile: this wrapper only participates in layout on Chart tab; otherwise it stole 50% height while children were display:none */}
      <div className={`market-main-area${mobileMarketTab === 'chart' ? ' mobile-market-main-active' : ''}`}>
      {/* Chart Section - wrapped for mobile tabs */}
      <div className={`market-section chart-section ${mobileMarketTab === 'chart' ? 'active' : ''}`}>
        {/* MT5-style mobile trade bar — only visible on mobile */}
        <div className="mobi-mt5-bar">
          <div className="mobi-mt5-symbol-row">
            <span className="mobi-mt5-symbol" onClick={() => setMobileMarketTab('instruments')}>{selectedSymbol}</span>
            <span className="mobi-mt5-change" style={{ color: (selectedInstrument?.change || 0) >= 0 ? 'var(--m-green, #26a69a)' : 'var(--m-red, #ef5350)' }}>
              {(selectedInstrument?.change || 0) >= 0 ? '+' : ''}{(selectedInstrument?.change || 0).toFixed ? (selectedInstrument?.change || 0).toFixed(2) : '0.00'}%
            </span>
          </div>
          <div className="mobi-mt5-trade-row">
            <button
              type="button"
              className="mobi-mt5-sell-btn"
              onClick={() => { setOrderSide('sell'); handlePlaceOrder('sell'); }}
              disabled={isPlacingOrder}
            >
              <span className="mobi-mt5-btn-label">SELL</span>
              <span className="mobi-mt5-btn-price">{formatPrice(selectedInstrument?.bid || 0, selectedSymbol)}</span>
            </button>
            <div className="mobi-mt5-vol-wrap">
              <button type="button" className="mobi-mt5-vol-btn" onClick={() => setVolume(prev => Math.max(0.01, parseFloat(((parseFloat(prev) || 0.01) - 0.01).toFixed(6))).toString())}>−</button>
              <input
                type="text"
                inputMode="decimal"
                className="mobi-mt5-vol-input"
                value={volume}
                onChange={(e) => { const val = e.target.value; if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) setVolume(val); }}
              />
              <button type="button" className="mobi-mt5-vol-btn" onClick={() => setVolume(prev => parseFloat(((parseFloat(prev) || 0.01) + 0.01).toFixed(6)).toString())}>+</button>
            </div>
            <button
              type="button"
              className="mobi-mt5-buy-btn"
              onClick={() => { setOrderSide('buy'); handlePlaceOrder('buy'); }}
              disabled={isPlacingOrder}
            >
              <span className="mobi-mt5-btn-label">BUY</span>
              <span className="mobi-mt5-btn-price">{formatPrice(selectedInstrument?.ask || 0, selectedSymbol)}</span>
            </button>
          </div>
        </div>
        <div className="chart-tabs-bar">
          <div className="chart-tabs">
            {chartTabs.map(symbol => (
              <div key={symbol} className={`chart-tab ${selectedSymbol === symbol ? 'active' : ''}`} onClick={() => setSelectedSymbol(symbol)}>
                <span>{symbol}</span>
                {chartTabs.length > 1 && <button className="close-tab" onClick={(e) => removeChartTab(symbol, e)}>×</button>}
              </div>
            ))}
            <button className="add-tab">+</button>
          </div>
        </div>
        <div className="mobi-chart-ohlc-bar mobi-ohlc-row">
          <div className="mobi-ohlc-item">
            <div className="mobi-ohlc-label">Bid</div>
            <div className="mobi-ohlc-val">{formatPrice(selectedInstrument?.bid || 0, selectedSymbol)}</div>
          </div>
          {selectedInstrument?.spreadAmount > 0 && (
            <div className="mobi-ohlc-item">
              <div className="mobi-ohlc-label">Spread</div>
              <div className="mobi-ohlc-val">{selectedInstrument.spreadAmount.toFixed(selectedInstrument.bid < 10 ? 4 : 2)}</div>
            </div>
          )}
          <div className="mobi-ohlc-item">
            <div className="mobi-ohlc-label">Ask</div>
            <div className="mobi-ohlc-val">{formatPrice(selectedInstrument?.ask || 0, selectedSymbol)}</div>
          </div>
          <div className="mobi-ohlc-item">
            <div className="mobi-ohlc-label">Low</div>
            <div className="mobi-ohlc-val">{formatPrice(selectedInstrument?.low || 0, selectedSymbol)}</div>
          </div>
          <div className="mobi-ohlc-item">
            <div className="mobi-ohlc-label">High</div>
            <div className="mobi-ohlc-val">{formatPrice(selectedInstrument?.high || 0, selectedSymbol)}</div>
          </div>
        </div>
        <div className="chart-container" ref={chartContainerRef}>
          {/* Drag overlay — blocks iframe from stealing mouse during resize */}
          {isDraggingResize && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, cursor: 'ns-resize' }} />
          )}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
            {selectedInstrument && (
              <TVChartContainer
                symbol={selectedSymbol}
                dataSource={chartDataSource}
                theme={isDark ? 'Dark' : 'Light'}
                livePriceObj={selectedInstrument}
                positions={positions}
                orderSide={orderSide}
                onBuyClick={() => {
                  setOrderSide('buy');
                  handlePlaceOrder('buy');
                }}
                onSellClick={() => {
                  setOrderSide('sell');
                  handlePlaceOrder('sell');
                }}
                onClosePosition={(pos, vol) => handleClosePosition(pos, vol)}
              />
            )}
          </div>
          {/* Custom Currency Toggle Overlay */}
          <div className="chart-currency-overlay">
            <select 
              value={displayCurrency} 
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className="chart-currency-select"
            >
              <option value="USD">USD</option>
              <option value="INR">INR</option>
            </select>
          </div>
        </div>

        {/* Drag Handle */}
        <div className="positions-drag-handle" onMouseDown={handleDragStart} title="Drag to resize">
          <div className="drag-grip" />
        </div>

        {/* Order Book */}
        <div className="order-book" style={{ height: positionsHeight, maxHeight: '65vh', minHeight: 120 }}>
          <div className="order-tabs">
            <button className={`order-tab ${activeTab === 'positions' ? 'active' : ''}`} onClick={() => setActiveTab('positions')}>Positions({positions.length})</button>
            <button className={`order-tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>Pending({pendingOrders.length})</button>
            <button className={`order-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>History({tradeHistory.length})</button>
            <button className={`order-tab ${activeTab === 'cancelled' ? 'active' : ''}`} onClick={() => setActiveTab('cancelled')}>Cancelled({cancelledOrders.length})</button>
            <div className="order-controls">
              <div className="currency-toggle">
                {(allowedCurrencyDisplay === 'BOTH' || allowedCurrencyDisplay === 'USD') && (
                  <button className={`curr-btn ${displayCurrency === 'USD' ? 'active' : ''}`} onClick={() => handleCurrencyChange('USD')}>$</button>
                )}
                {(allowedCurrencyDisplay === 'BOTH' || allowedCurrencyDisplay === 'INR') && (
                  <button className={`curr-btn ${displayCurrency === 'INR' ? 'active' : ''}`} onClick={() => handleCurrencyChange('INR')}>₹</button>
                )}
              </div>
              <span className={`pnl ${marketHeaderFloatingPnL >= 0 ? 'profit' : 'loss'}`}>
                P/L: {marketHeaderFloatingPnL >= 0 ? '+' : '-'}{Math.abs(marketHeaderFloatingPnL).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="positions-content">
            {activeTab === 'positions' && (
              <table className="positions-table">
                <thead><tr><th>Time</th><th>Sym</th><th>M</th><th>Side</th><th>Size</th><th>Entry</th><th>Current</th><th>Comm</th><th>Swap</th><th>P/L</th><th></th></tr></thead>
                <tbody>
                  {positions.length === 0 ? (
                    <tr><td colSpan="11" className="no-data">No open positions</td></tr>
                  ) : (
                    positions.map((pos) => {
                      const currentPrice = getCurrentPrice(pos);
                      const profit = calculateProfit(pos);
                      const modeLabel = pos.mode === 'hedging' ? 'H' : pos.mode === 'netting' ? 'N' : pos.mode === 'binary' ? 'B' : '-';
                      const isBinary = pos.mode === 'binary';
                      
                      // Calculate remaining time for binary trades
                      let timeRemaining = '';
                      let binaryPnL = '';
                      if (isBinary && pos.expiry && pos.createdAt) {
                        const expiryTime = new Date(pos.createdAt).getTime() + (pos.expiry * 1000);
                        const now = Date.now();
                        const remaining = Math.max(0, Math.floor((expiryTime - now) / 1000));
                        if (remaining > 0) {
                          const mins = Math.floor(remaining / 60);
                          const secs = remaining % 60;
                          timeRemaining = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                        } else {
                          timeRemaining = 'Expired';
                        }
                        // Binary P/L shows potential win/loss
                        const amount = pos.amount || 0;
                        const currSymbol = displayCurrency === 'INR' ? '₹' : '$';
                        binaryPnL = currentPrice > pos.entryPrice 
                          ? (pos.direction === 'up' ? `+${currSymbol}${(amount * 0.85).toFixed(2)}` : `-${currSymbol}${amount.toFixed(2)}`)
                          : (pos.direction === 'down' ? `+${currSymbol}${(amount * 0.85).toFixed(2)}` : `-${currSymbol}${amount.toFixed(2)}`);
                      }
                      
                      return (
                        <tr key={pos._id || pos.tradeId} className={isBinary ? 'binary-row' : ''}>
                          <td>
                            {isBinary ? (
                              <span className={`binary-timer ${timeRemaining === 'Expired' ? 'expired' : ''}`}>{timeRemaining || 'Loading...'}</span>
                            ) : (
                              new Date(pos.openTime || pos.createdAt).toLocaleTimeString()
                            )}
                          </td>
                          <td>{pos.symbol}</td>
                          <td><span className={`mode-text mode-${pos.mode || 'hedging'}`}>{modeLabel}</span></td>
                          <td className={pos.side || pos.direction}>{(pos.side || pos.direction)?.toUpperCase()}</td>
                          <td>
                            {isBinary
                              ? `${displayCurrency === 'INR' ? '₹' : '$'}${pos.amount}`
                              : `${parseFloat(pos.volume).toFixed(2)} ${
                                  pos.mode === 'netting' &&
                                  isIndianCashEquitySegmentCode(
                                    resolveSegmentApiName(pos.symbol, pos)
                                  )
                                    ? 'shares'
                                    : 'lots'
                                }`}
                          </td>
                          <td>{formatPrice(pos.entryPrice || pos.avgPrice, pos.symbol)}</td>
                          <td>{formatPrice(currentPrice, pos.symbol)}</td>
                          <td style={{ color: '#f59e0b', fontSize: '11px' }}>{(() => {
                            const commUsd = pos.commission || pos.openCommission || 0;
                            const commInr = pos.commissionInr || pos.openCommissionInr || 0;
                            const rate = usdInrRate + usdMarkup;
                            if (commUsd <= 0 && commInr <= 0) return '—';
                            if (displayCurrency === 'INR') {
                              const inr = commInr > 0 ? commInr : commUsd * rate;
                              return `-₹${inr.toFixed(2)}`;
                            }
                            const usdShow = commInr > 0 ? commInr / rate : commUsd;
                            return `-$${usdShow.toFixed(2)}`;
                          })()}</td>
                          <td style={{ color: '#8b5cf6', fontSize: '11px' }}>{(pos.swap || 0) !== 0 ? formatPnL(pos.swap || 0, pos.symbol) : '—'}</td>
                          <td className={profit >= 0 ? 'profit' : 'loss'}>
                            {isBinary ? binaryPnL : formatPnL(profit, pos.symbol)}
                          </td>
                          <td>
                            {!isBinary && (
                              <>
                                <button className="act-btn" onClick={() => openEditModal(pos)} title="Edit">✎</button>
                                <button className="act-btn close" onClick={() => openCloseModal(pos)} title="Close">✕</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
            {activeTab === 'pending' && (
              <table className="positions-table">
                <thead><tr><th>Time</th><th>Sym</th><th>Type</th><th>Size</th><th>Price</th><th></th></tr></thead>
                <tbody>
                  {pendingOrders.length === 0 ? (
                    <tr><td colSpan="6" className="no-data">No pending orders</td></tr>
                  ) : (
                    pendingOrders.map((order) => (
                      <tr key={order._id || order.tradeId}>
                        <td>{new Date(order.createdAt).toLocaleTimeString()}</td>
                        <td>{order.symbol}</td>
                        <td className={order.side}>{order.orderType} {order.side?.toUpperCase()}</td>
                        <td>{order.volume}</td>
                        <td>{formatPrice(order.entryPrice || order.avgPrice, order.symbol)}</td>
                        <td>
                          <button className="edit-pos-btn" onClick={() => openEditModal(order)} style={{ marginRight: 6, background: '#3b82f6', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
                          <button className="close-pos-btn" onClick={() => handleCancelPendingOrder(order)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
            {activeTab === 'history' && (
              <>
                <div className="order-book-history-table-wrap">
                  <table className="positions-table">
                    <thead><tr><th>Time</th><th>Sym</th><th>M</th><th>Side</th><th>Size</th><th>Entry</th><th>Close</th><th>Comm</th><th>Swap</th><th>P/L</th><th>Remark</th></tr></thead>
                    <tbody>
                      {tradeHistory.length === 0 ? (
                        <tr><td colSpan="11" className="no-data">No trade history</td></tr>
                      ) : (
                        paginatedOrderBookHistory.map((trade) => {
                          const modeLabel = trade.mode === 'hedging' ? 'H' : trade.mode === 'netting' ? 'N' : trade.mode === 'binary' ? 'B' : '-';
                          const historyRowPnl =
                            netProfitInrIndianNettingClose(trade, rateHdr) ?? (Number(trade.profit) || 0);
                          return (
                            <tr key={trade._id || trade.tradeId}>
                              <td>{new Date(trade.closedAt || trade.executedAt || trade.closeTime || trade.createdAt).toLocaleTimeString()}</td>
                              <td>{trade.symbol}</td>
                              <td><span className={`mode-text mode-${trade.mode || 'hedging'}`}>{modeLabel}</span></td>
                              <td className={trade.side}>{trade.side?.toUpperCase()}</td>
                              <td>{trade.volume}</td>
                              <td>{formatPrice(trade.entryPrice, trade.symbol)}</td>
                              <td>{formatPrice(trade.closePrice, trade.symbol)}</td>
                              <td style={{ color: '#f59e0b', fontSize: '11px' }}>{(() => {
                                const commUsd = trade.commission || 0;
                                const commInr = trade.commissionInr || 0;
                                const rate = usdInrRate + usdMarkup;
                                if (commUsd <= 0 && commInr <= 0) return '—';
                                if (displayCurrency === 'INR') {
                                  const inr = commInr > 0 ? commInr : commUsd * rate;
                                  return `-₹${inr.toFixed(2)}`;
                                }
                                const usdShow = commInr > 0 ? commInr / rate : commUsd;
                                return `-$${usdShow.toFixed(2)}`;
                              })()}</td>
                              <td style={{ color: '#8b5cf6', fontSize: '11px' }}>{(trade.swap || 0) !== 0 ? formatPnL(trade.swap || 0, trade.symbol) : '—'}</td>
                              <td className={historyRowPnl >= 0 ? 'profit' : 'loss'}>
                                {formatPnL(historyRowPnl, trade.symbol)}
                              </td>
                              <td style={{ fontSize: '11px', color: trade.remark === 'SL' ? '#ef4444' : trade.remark === 'TP' ? '#10b981' : trade.remark === 'Stop Out' ? '#dc2626' : '#9ca3af' }}>{trade.remark || trade.closedBy || '—'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {tradeHistory.length > 0 && orderBookHistoryPageCount > 1 && (
                  <div className="order-book-history-pagination" role="navigation" aria-label="Trade history pages">
                    <span className="order-book-history-pagination-range">
                      {orderBookHistoryRangeStart}–{orderBookHistoryRangeEnd} of {tradeHistory.length}
                    </span>
                    <div className="order-book-history-pagination-actions">
                      <button
                        type="button"
                        className="order-book-history-page-btn"
                        disabled={orderBookHistoryPage <= 1}
                        onClick={() => setOrderBookHistoryPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </button>
                      <span className="order-book-history-page-label">
                        {orderBookHistoryPage} / {orderBookHistoryPageCount}
                      </span>
                      <button
                        type="button"
                        className="order-book-history-page-btn"
                        disabled={orderBookHistoryPage >= orderBookHistoryPageCount}
                        onClick={() => setOrderBookHistoryPage((p) => Math.min(orderBookHistoryPageCount, p + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {activeTab === 'cancelled' && (
              <table className="positions-table">
                <thead><tr><th>Time</th><th>Sym</th><th>Type</th><th>Size</th><th>Price</th><th>Reason</th></tr></thead>
                <tbody>
                  {cancelledOrders.length === 0 ? (
                    <tr><td colSpan="6" className="no-data">No cancelled orders</td></tr>
                  ) : (
                    cancelledOrders.map((order) => (
                      <tr key={order._id || order.tradeId}>
                        <td>{new Date(order.cancelledAt || order.createdAt).toLocaleTimeString()}</td>
                        <td>{order.symbol}</td>
                        <td className={order.side}>{order.orderType} {order.side?.toUpperCase()}</td>
                        <td>{order.volume}</td>
                        <td>{formatPrice(order.entryPrice, order.symbol)}</td>
                        <td>{order.cancelReason || 'User cancelled'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedPosition && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ {selectedPosition.status === 'pending' ? 'Modify Pending Order' : 'Modify Position'}</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="position-info">
                <span className={`side-badge ${selectedPosition.side}`}>{selectedPosition.side?.toUpperCase()}</span>
                <span className="symbol">{selectedPosition.symbol}</span>
                <span className="volume">
                  {selectedPosition.volume}{' '}
                  {selectedPosition.mode === 'netting' &&
                  isIndianCashEquitySegmentCode(
                    resolveSegmentApiName(selectedPosition.symbol, selectedPosition)
                  )
                    ? 'shares'
                    : 'lots'}
                </span>
                {selectedPosition.status === 'pending' && <span className="order-type-badge">{selectedPosition.orderType?.toUpperCase()}</span>}
              </div>
              {selectedPosition.status === 'pending' && (
                <div className="modal-input-group">
                  <label>Order Price</label>
                  <input type="number" step="0.00001" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="Enter order price" />
                </div>
              )}
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
                <span className="close-volume">
                  {selectedPosition.volume}{' '}
                  {selectedPosition.mode === 'netting' &&
                  isIndianCashEquitySegmentCode(
                    resolveSegmentApiName(selectedPosition.symbol, selectedPosition)
                  )
                    ? 'shares'
                    : 'lots'}
                </span>
              </div>
              <button className="modal-close" onClick={() => setShowCloseModal(false)}>×</button>
            </div>
            <div className="close-modal-body">
              <div className="close-actions-row">
                <button className="close-action-btn primary" onClick={() => handleClosePosition(selectedPosition, selectedPosition.volume)}>Close Position</button>
                <button className="close-action-btn secondary" onClick={async () => {
                  if (confirm('Close ALL positions?')) {
                    for (const pos of positions) { await handleClosePosition(pos, pos.volume); }
                  }
                }}>Close All</button>
              </div>
              <div className="partial-section">
                <div className="partial-header">Partial Close</div>
                <div className="partial-input-row">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedPosition.volume}
                    value={closeVolume}
                    onChange={(e) => setCloseVolume(e.target.value)}
                    placeholder={
                      selectedPosition.mode === 'netting' &&
                      isIndianCashEquitySegmentCode(
                        resolveSegmentApiName(selectedPosition.symbol, selectedPosition)
                      )
                        ? 'Quantity'
                        : 'Volume'
                    }
                  />
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

      {/* Right Panel — toggles between Symbols list and Order form */}
      <div className="market-right-panel desktop-market-trade-section" style={{ width: rightPanelWidth, minWidth: 200, maxWidth: 500 }}>
        {/* Horizontal drag handle — left edge of right panel */}
        <div
          className="right-panel-drag-handle"
          onMouseDown={handleRightPanelDragStart}
          title="Drag to resize"
        >
          <div className="right-panel-drag-grip" />
        </div>
        {isDraggingRightPanel && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'ew-resize' }} />
        )}
        <div className="right-panel-tabs">
          <button
            className={`rp-tab${!instrumentsPanelCollapsed ? ' active' : ''}`}
            onClick={() => setInstrumentsPanelCollapsed(false)}
          >
            Symbols
          </button>
          <button
            className={`rp-tab${instrumentsPanelCollapsed ? ' active' : ''}`}
            onClick={() => setInstrumentsPanelCollapsed(true)}
          >
            Order
          </button>
        </div>
        {!instrumentsPanelCollapsed ? (
          <div className="instruments-panel">
            {renderDynamicTopSearchArea(false)}
            {renderSegmentTabsGroup()}
            {renderSegmentTabContent(false)}
          </div>
        ) : (
          <div className="order-panel">
            {renderOrderPanelContents()}
          </div>
        )}
      </div>
      </div>

      {/* History Section for mobile - Positions/Orders */}
      <div className={`market-section history-section ${mobileMarketTab === 'history' ? 'active' : ''}`}>
        <div className="mobile-positions-wrapper">
          <div className="positions-header">
            <h3>Open Positions ({positions.length})</h3>
            <span className={`total-pnl ${marketHeaderFloatingPnL >= 0 ? 'profit' : 'loss'}`}>
              {marketHeaderFloatingPnL >= 0 ? '+' : '-'}{Math.abs(marketHeaderFloatingPnL).toFixed(2)}
            </span>
          </div>
          {positions.length === 0 ? (
            <div className="no-positions">No open positions</div>
          ) : (
            <div className="positions-list-mobile">
              {positions.map(pos => {
                const openPrice = pos.openPrice || pos.entryPrice || pos.avgPrice || 0;
                const vol = pos.volume || pos.lots || 0;
                const profit = calculateProfit(pos) || 0;
                const mobUnit =
                  pos.mode === 'netting' &&
                  isIndianCashEquitySegmentCode(resolveSegmentApiName(pos.symbol, pos))
                    ? 'shares'
                    : 'lots';
                return (
                  <div key={pos.positionId || pos._id || pos.symbol} className="position-card-mobile">
                    <div className="pos-top">
                      <span className={`pos-side ${pos.side || 'buy'}`}>{(pos.side || 'BUY').toUpperCase()}</span>
                      <span className="pos-symbol">{pos.symbol}</span>
                      <span className="pos-volume">
                        {vol} {mobUnit}
                      </span>
                    </div>
                    <div className="pos-bottom">
                      <span className="pos-price">@ {formatPrice(openPrice, pos.symbol)}</span>
                      <span className={`pos-pnl ${profit >= 0 ? 'profit' : 'loss'}`}>
                        {formatPnL(profit, pos.symbol)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>


    </div>
  );
}

export default MarketPage;
