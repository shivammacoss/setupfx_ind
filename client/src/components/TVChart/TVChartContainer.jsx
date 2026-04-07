import React, { useEffect, useRef, useState, useCallback } from 'react';
import Datafeed from './datafeed';

const TVChartContainer = ({
    symbol,
    dataSource = 'zerodha',
    theme = 'Light',
    livePriceObj,
    positions = [],
    orderSide = 'buy',
    onBuyClick,
    onSellClick,
    onClosePosition,
}) => {
    const chartContainerRef = useRef(null);
    const tvWidgetRef = useRef(null);
    const [widgetReady, setWidgetReady] = useState(false);
    const positionLinesRef = useRef({});
    // Track text shape IDs + their prices so we can reposition on scroll
    const textShapeMapRef = useRef({}); // { shapeId: { price } }
    const rangeSubRef = useRef(null);
    const repositionIntervalRef = useRef(null);
    // LTP line refs
    const ltpLineRef = useRef(null);
    const ltpLabelRef = useRef(null);
    /** Prevents stacked LTP shapes when live ticks race async createShape */
    const ltpSetupGenRef = useRef(0);

    // Refs to hold latest callback props (avoids stale closure in TradingView listeners)
    const onBuyClickRef = useRef(onBuyClick);
    const onSellClickRef = useRef(onSellClick);
    const onClosePositionRef = useRef(onClosePosition);

    // Keep refs in sync with latest props
    useEffect(() => { onBuyClickRef.current = onBuyClick; }, [onBuyClick]);
    useEffect(() => { onSellClickRef.current = onSellClick; }, [onSellClick]);
    useEffect(() => { onClosePositionRef.current = onClosePosition; }, [onClosePosition]);

    // Initialize TV Widget
    useEffect(() => {
        if (!chartContainerRef.current) return;
        setWidgetReady(false);

        const encodedSymbol = `${dataSource}|${symbol}`;

        const widgetOptions = {
            symbol: encodedSymbol,
            datafeed: Datafeed,
            interval: '5',
            container: chartContainerRef.current,
            library_path: '/charting_library/',
            locale: 'en',
            disabled_features: [
                'use_localstorage_for_settings',
                'header_symbol_search',
                'header_compare',
                'display_market_status',
                // keep control_bar ENABLED so bottom zoom (+/−/scroll/reset) is visible
                'timeframes_toolbar',
            ],
            enabled_features: [
                'study_templates',
                'hide_left_toolbar_by_default',
                'items_favoriting',
                'show_exchange_logos',
            ],
            charts_storage_url: 'https://saveload.tradingview.com',
            charts_storage_api_version: '1.1',
            client_id: 'SetupFX.local',
            user_id: 'public_user',
            fullscreen: false,
            autosize: true,
            theme: theme,
            toolbar_bg: theme === 'Dark' ? '#000000' : '#EDF2F4',
            overrides: {
                'paneProperties.background': theme === 'Dark' ? '#000000' : '#EDF2F4',
                'paneProperties.backgroundType': 'solid',
                'paneProperties.vertGridProperties.color': theme === 'Dark' ? '#0d0d0d' : '#d8dee2',
                'paneProperties.horzGridProperties.color': theme === 'Dark' ? '#0d0d0d' : '#d8dee2',
                'scalesProperties.textColor': theme === 'Dark' ? '#6b7280' : '#4a5568',
                'scalesProperties.lineColor': theme === 'Dark' ? '#1a1a1a' : '#c5cdd3',
            },
        };

        const widget = new window.TradingView.widget(widgetOptions);
        tvWidgetRef.current = widget;

        widget.onChartReady(() => {
            setWidgetReady(true);

            widget.headerReady().then(() => {
                const buyBtn = widget.createButton();
                buyBtn.setAttribute('title', 'Quick Buy');
                buyBtn.innerHTML = '<div style="color:#22c55e;font-weight:bold;padding:0 8px;cursor:pointer;">Buy</div>';
                buyBtn.addEventListener('click', () => { if (onBuyClickRef.current) onBuyClickRef.current('buy'); });

                const sellBtn = widget.createButton();
                sellBtn.setAttribute('title', 'Quick Sell');
                sellBtn.innerHTML = '<div style="color:#ef4444;font-weight:bold;padding:0 8px;cursor:pointer;">Sell</div>';
                sellBtn.addEventListener('click', () => { if (onSellClickRef.current) onSellClickRef.current('sell'); });
            });

            // Subscribe to visible range changes to keep text boxes pinned to left edge
            try {
                const chart = widget.activeChart();
                const sub = chart.onVisibleRangeChanged();
                sub.subscribe(null, (range) => {
                    repositionTextShapes(range);
                });
                rangeSubRef.current = sub;

                // Backup: interval-based reposition to catch cases the event misses
                repositionIntervalRef.current = setInterval(() => {
                    try {
                        const r = chart.getVisibleRange();
                        if (r) repositionTextShapes(r);
                    } catch {}
                }, 300);
            } catch {}

            updatePositionsLines(positions);
        });

        return () => {
            ltpSetupGenRef.current += 1;
            ltpLineRef.current = null;
            ltpLabelRef.current = null;
            if (repositionIntervalRef.current) clearInterval(repositionIntervalRef.current);
            if (rangeSubRef.current) {
                try { rangeSubRef.current.unsubscribe(null); } catch {}
            }
            if (tvWidgetRef.current) {
                tvWidgetRef.current.remove();
                tvWidgetRef.current = null;
            }
        };
    }, [symbol, dataSource, theme]);

    // Reposition all text shape boxes to the current left edge of the visible range
    const repositionTextShapes = useCallback((range) => {
        if (!tvWidgetRef.current) return;
        let chart;
        try { chart = tvWidgetRef.current.activeChart(); } catch { return; }

        const leftTime = range?.from;
        if (!leftTime) return;

        // Add offset so the label sits clearly inside the visible area (not at the very edge)
        const totalRange = (range?.to || leftTime + 600) - leftTime;
        const offsetTime = leftTime + Math.max(5, totalRange * 0.02);

        for (const [shapeId, info] of Object.entries(textShapeMapRef.current)) {
            try {
                const shapeApi = chart.getShapeById(shapeId);
                if (shapeApi) {
                    shapeApi.setPoints([{ time: offsetTime, price: info.price }]);
                }
            } catch {}
        }
    }, []);

    // Sync price side
    useEffect(() => {
        Datafeed.setPriceSide(orderSide === 'buy' ? 'ask' : 'bid');
    }, [orderSide]);

    // Feed live price
    useEffect(() => {
        if (!livePriceObj) return;
        const encodedSymbol = `${dataSource}|${symbol}`;
        Datafeed.updateLivePrice(encodedSymbol, livePriceObj);
    }, [livePriceObj, symbol, dataSource]);

    // LTP price line on chart (single line + one text label; axis price tag disabled to avoid duplicates)
    useEffect(() => {
        if (!widgetReady || !tvWidgetRef.current || !livePriceObj) return;

        const ltp = livePriceObj.lastPrice || livePriceObj.last_price
            || ((livePriceObj.bid || 0) + (livePriceObj.ask || 0)) / 2 || 0;
        if (!ltp || ltp <= 0) return;

        let chart;
        try { chart = tvWidgetRef.current.activeChart(); } catch { return; }
        if (!chart) return;

        const setupGen = ++ltpSetupGenRef.current;

        // Try to update existing LTP line + label (fast path — no async)
        if (ltpLineRef.current) {
            try {
                const lineApi = chart.getShapeById(ltpLineRef.current);
                if (lineApi) {
                    lineApi.setPoints([{ price: ltp }]);
                    if (ltpLabelRef.current) {
                        const labelApi = chart.getShapeById(ltpLabelRef.current);
                        if (labelApi) {
                            const pts = labelApi.getPoints?.() || [];
                            const t = pts[0]?.time || Math.floor(Date.now() / 1000);
                            labelApi.setPoints([{ time: t, price: ltp }]);
                            if (typeof labelApi.setText === 'function') {
                                labelApi.setText(`  LTP: ${ltp}  `);
                            }
                            textShapeMapRef.current[ltpLabelRef.current] = { price: ltp };
                        }
                    }
                    return;
                }
            } catch {}
        }

        // First time or shape was lost — create (async); drop stale runs so we never stack yellow labels
        (async () => {
            if (setupGen !== ltpSetupGenRef.current) return;

            if (ltpLineRef.current) {
                try { chart.removeEntity(ltpLineRef.current); } catch {}
                ltpLineRef.current = null;
            }
            if (ltpLabelRef.current) {
                try { chart.removeEntity(ltpLabelRef.current); } catch {}
                delete textShapeMapRef.current[ltpLabelRef.current];
                ltpLabelRef.current = null;
            }

            if (setupGen !== ltpSetupGenRef.current) return;

            try {
                const lineId = await chart.createShape(
                    { price: ltp },
                    {
                        shape: 'horizontal_line',
                        lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                        overrides: {
                            linecolor: '#FFB300',
                            linestyle: 1,
                            linewidth: 1,
                            showLabel: false,
                            showPrice: false,
                            textcolor: '#FFB300',
                        }
                    }
                );
                if (setupGen !== ltpSetupGenRef.current) {
                    if (lineId) try { chart.removeEntity(lineId); } catch {}
                    return;
                }
                if (lineId) ltpLineRef.current = lineId;
            } catch {}

            try {
                let anchorTime;
                try {
                    const range = chart.getVisibleRange();
                    const totalRange = (range?.to || range?.from + 600) - (range?.from || 0);
                    anchorTime = (range?.from || Math.floor(Date.now() / 1000) - 3600) + Math.max(5, totalRange * 0.02);
                } catch {
                    anchorTime = Math.floor(Date.now() / 1000) - 3600;
                }

                const ltpText = `  LTP: ${ltp}  `;
                const textId = await chart.createShape(
                    { time: anchorTime, price: ltp },
                    {
                        shape: 'text',
                        lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                        text: ltpText,
                        overrides: {
                            color: '#000000',
                            fontsize: 10,
                            bold: true,
                            fillBackground: true,
                            backgroundColor: '#FFB300',
                            backgroundTransparency: 10,
                            drawBorder: true,
                            borderColor: '#FFB300',
                            fixedSize: false,
                        }
                    }
                );
                if (setupGen !== ltpSetupGenRef.current) {
                    if (textId) try { chart.removeEntity(textId); } catch {}
                    return;
                }
                if (textId) {
                    ltpLabelRef.current = textId;
                    textShapeMapRef.current[textId] = { price: ltp };
                }
            } catch {}
        })();
    }, [livePriceObj, widgetReady]);

    // Update position lines
    useEffect(() => {
        if (widgetReady) updatePositionsLines(positions);
    }, [positions, widgetReady]);

    const updatePositionsLines = useCallback(async (posList) => {
        if (!tvWidgetRef.current || !widgetReady) return;

        let chart;
        try { chart = tvWidgetRef.current.activeChart(); } catch { return; }
        if (!chart) return;

        const myPositions = posList.filter(p => p.symbol === symbol);

        // Cleanup existing
        for (const key of Object.keys(positionLinesRef.current)) {
            try {
                const lineObj = positionLinesRef.current[key];
                if (lineObj && typeof lineObj === 'object' && lineObj.remove) lineObj.remove();
                else if (typeof lineObj === 'string' || typeof lineObj === 'number') chart.removeEntity(lineObj);
            } catch {}
        }
        positionLinesRef.current = {};
        // Keep LTP text shape in the map so scroll-reposition still works (LTP entities are not in positionLinesRef)
        const ltpTextId = ltpLabelRef.current;
        const ltpPreserve = {};
        if (ltpTextId) {
            const p = textShapeMapRef.current[ltpTextId]?.price;
            if (p != null && Number.isFinite(p)) ltpPreserve[ltpTextId] = { price: p };
        }
        textShapeMapRef.current = ltpPreserve;

        // Get leftmost visible bar time for initial text shape placement
        let anchorTime;
        try {
            const range = chart.getVisibleRange();
            anchorTime = (range?.from || Math.floor(Date.now() / 1000) - 3600) + 2;
        } catch {
            anchorTime = Math.floor(Date.now() / 1000) - 3600;
        }

        for (const pos of myPositions) {
            const entryPrice = pos.entryPrice || pos.avgPrice;
            if (!entryPrice) continue;

            const isBuy = pos.side === 'buy';
            const color = isBuy ? '#26a69a' : '#ef5350';
            const bgColor = theme === 'Dark' ? '#0a0a0a' : '#EDF2F4';
            const profitVal = pos.profit ?? 0;
            const profitColor = profitVal >= 0 ? '#26a69a' : '#ef5350';
            const profitText = profitVal >= 0
                ? `+$${profitVal.toFixed(2)}`
                : `-$${Math.abs(profitVal).toFixed(2)}`;

            // ---- Try createPositionLine (Trading Platform tier) ----
            try {
                const line = await chart.createPositionLine();
                line
                    .setText(`${isBuy ? '▲ BUY' : '▼ SELL'} ${pos.volume} lot  |  P/L: ${profitText}`)
                    .setTooltip(`Entry: ${entryPrice} | Volume: ${pos.volume}`)
                    .setProtectTooltip('Set SL/TP')
                    .setCloseTooltip('Close Position')
                    .setReverseTooltip('Reverse Position')
                    .setQuantity(String(pos.volume))
                    .setPrice(entryPrice)
                    .setExtendLeft(false)
                    .setLineStyle(0)
                    .setLineLength(80)
                    .setLineColor(color)
                    .setBodyFont('bold 11px Inter, sans-serif')
                    .setBodyTextColor('#ffffff')
                    .setBodyBorderColor(color)
                    .setBodyBackgroundColor(color)
                    .setQuantityFont('bold 11px Inter, sans-serif')
                    .setQuantityTextColor('#ffffff')
                    .setQuantityBorderColor(color)
                    .setQuantityBackgroundColor(color)
                    .setCloseButtonBorderColor(color)
                    .setCloseButtonBackgroundColor(bgColor)
                    .setCloseButtonIconColor(color);

                line.onClose(() => { if (onClosePositionRef.current) onClosePositionRef.current(pos, pos.volume); });
                positionLinesRef.current[pos._id] = line;

                if (pos.stopLoss) {
                    try {
                        const sl = await chart.createOrderLine();
                        sl.setText('SL').setQuantity(String(pos.volume)).setPrice(pos.stopLoss)
                          .setExtendLeft(false).setLineStyle(2).setLineLength(50).setLineColor('#ef5350')
                          .setBodyFont('bold 10px Inter').setBodyTextColor('#fff').setBodyBorderColor('#ef5350').setBodyBackgroundColor('#ef5350')
                          .setQuantityFont('bold 10px Inter').setQuantityTextColor('#fff').setQuantityBorderColor('#ef5350').setQuantityBackgroundColor('#ef5350');
                        positionLinesRef.current[`${pos._id}_sl`] = sl;
                    } catch {}
                }
                if (pos.takeProfit) {
                    try {
                        const tp = await chart.createOrderLine();
                        tp.setText('TP').setQuantity(String(pos.volume)).setPrice(pos.takeProfit)
                          .setExtendLeft(false).setLineStyle(2).setLineLength(50).setLineColor('#26a69a')
                          .setBodyFont('bold 10px Inter').setBodyTextColor('#fff').setBodyBorderColor('#26a69a').setBodyBackgroundColor('#26a69a')
                          .setQuantityFont('bold 10px Inter').setQuantityTextColor('#fff').setQuantityBorderColor('#26a69a').setQuantityBackgroundColor('#26a69a');
                        positionLinesRef.current[`${pos._id}_tp`] = tp;
                    } catch {}
                }

            } catch (err) {
                // ---- Fallback: horizontal_line + text shape with auto-reposition ----
                console.warn('Position line unavailable (Trading Platform tier), using shape fallback');

                // 1. Dashed horizontal line at entry price (no label — the text shape IS the label)
                try {
                    const lineId = await chart.createShape(
                        { price: entryPrice },
                        {
                            shape: 'horizontal_line',
                            lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                            overrides: {
                                linecolor: color,
                                linestyle: 2,
                                linewidth: 1,
                                showLabel: false,
                                showPrice: true,
                                textcolor: color,
                            }
                        }
                    );
                    if (lineId) positionLinesRef.current[pos._id] = lineId;
                } catch {}

                // 2. Text shape with colored background box — shows quantity + PnL
                //    This is repositioned to the left edge on every scroll via onVisibleRangeChanged
                try {
                    const labelText = `  ${isBuy ? '▲ BUY' : '▼ SELL'}  ${pos.volume}  |  ${profitText}  `;
                    const textId = await chart.createShape(
                        { time: anchorTime, price: entryPrice },
                        {
                            shape: 'text',
                            lock: true,
                            disableSelection: true,
                            disableSave: true,
                            disableUndo: true,
                            text: labelText,
                            overrides: {
                                color: '#ffffff',
                                fontsize: 11,
                                bold: true,
                                fillBackground: true,
                                backgroundColor: color,
                                backgroundTransparency: 5,
                                drawBorder: true,
                                borderColor: color,
                                fixedSize: false,
                            }
                        }
                    );
                    if (textId) {
                        positionLinesRef.current[`${pos._id}_label`] = textId;
                        textShapeMapRef.current[textId] = { price: entryPrice };
                    }
                } catch (textErr) {
                    console.warn('Text shape fallback failed:', textErr.message);
                }

                // SL line + label
                if (pos.stopLoss) {
                    try {
                        const slId = await chart.createShape(
                            { price: pos.stopLoss },
                            {
                                shape: 'horizontal_line',
                                lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                                overrides: {
                                    linecolor: '#ef5350', linestyle: 2, linewidth: 1,
                                    showLabel: false, showPrice: true, textcolor: '#ef5350',
                                }
                            }
                        );
                        if (slId) positionLinesRef.current[`${pos._id}_sl`] = slId;
                    } catch {}

                    try {
                        const slTextId = await chart.createShape(
                            { time: anchorTime, price: pos.stopLoss },
                            {
                                shape: 'text',
                                lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                                text: `  SL  ${pos.volume}  `,
                                overrides: {
                                    color: '#ffffff', fontsize: 10, bold: true,
                                    fillBackground: true, backgroundColor: '#ef5350',
                                    backgroundTransparency: 5,
                                    drawBorder: true, borderColor: '#ef5350',
                                    fixedSize: false,
                                }
                            }
                        );
                        if (slTextId) {
                            positionLinesRef.current[`${pos._id}_sl_label`] = slTextId;
                            textShapeMapRef.current[slTextId] = { price: pos.stopLoss };
                        }
                    } catch {}
                }

                // TP line + label
                if (pos.takeProfit) {
                    try {
                        const tpId = await chart.createShape(
                            { price: pos.takeProfit },
                            {
                                shape: 'horizontal_line',
                                lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                                overrides: {
                                    linecolor: '#26a69a', linestyle: 2, linewidth: 1,
                                    showLabel: false, showPrice: true, textcolor: '#26a69a',
                                }
                            }
                        );
                        if (tpId) positionLinesRef.current[`${pos._id}_tp`] = tpId;
                    } catch {}

                    try {
                        const tpTextId = await chart.createShape(
                            { time: anchorTime, price: pos.takeProfit },
                            {
                                shape: 'text',
                                lock: true, disableSelection: true, disableSave: true, disableUndo: true,
                                text: `  TP  ${pos.volume}  `,
                                overrides: {
                                    color: '#ffffff', fontsize: 10, bold: true,
                                    fillBackground: true, backgroundColor: '#26a69a',
                                    backgroundTransparency: 5,
                                    drawBorder: true, borderColor: '#26a69a',
                                    fixedSize: false,
                                }
                            }
                        );
                        if (tpTextId) {
                            positionLinesRef.current[`${pos._id}_tp_label`] = tpTextId;
                            textShapeMapRef.current[tpTextId] = { price: pos.takeProfit };
                        }
                    } catch {}
                }
            }
        }
    }, [widgetReady, symbol, theme]);

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div
                ref={chartContainerRef}
                style={{ flex: 1, width: '100%', height: '100%' }}
                className="tv-chart-container"
            />
        </div>
    );
};

export default TVChartContainer;
