"use client";

import { useEffect, useRef, memo } from "react";
import { CustomDatafeed } from "@/lib/tradingview-datafeed";

interface TradingViewChartProps {
  token: string;
  symbol?: string;
  interval?: string;
  theme?: "light" | "dark";
  className?: string;
  onScreenshot?: () => void;
}

function TradingViewChartInner({
  token,
  symbol,
  interval = "5",
  theme = "dark",
  className = "",
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !token) return;

    // Stable, predictable id for the container so the widget never tries to
    // look up a stale timestamp-suffixed id (which is what was throwing
    // "There is no such element"). Token + theme are included so simultaneous
    // mounts on different symbols don't clash.
    const containerId = `tv_chart_${String(token).replace(/[^A-Za-z0-9_]/g, "_")}`;
    container.id = containerId;

    // Track cancellation so a fast re-render (React strict-mode double-mount,
    // theme flip, token change) doesn't end up initialising a widget on a
    // container that's already been torn down.
    let cancelled = false;

    const loadWidget = () => {
      if (cancelled) return;
      if (!window.TradingView) {
        setTimeout(loadWidget, 200);
        return;
      }
      // Verify the container is still in the DOM at the moment we hand it
      // to the widget. Without this check React's effect cleanup can have
      // already removed it, and the widget throws "no such element".
      if (!document.getElementById(containerId)) return;

      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch {}
        widgetRef.current = null;
      }

      const datafeed = new CustomDatafeed();

      try {
        widgetRef.current = new window.TradingView.widget({
          // Pass the live element reference, not just the id string — even if
          // React swaps containers under us this still resolves correctly.
          container,
          datafeed,
          symbol: token,
          interval,
          library_path: "/charting_library/",
          locale: "en",
          fullscreen: false,
          autosize: true,
          theme: theme === "dark" ? "dark" : "light",
          timezone: "Asia/Kolkata",
          disabled_features: [
            "use_localstorage_for_settings",
            "header_symbol_search",
            "header_compare",
            "display_market_status",
            "timeframes_toolbar",
            "go_to_date",
            "study_templates",
            "chart_storage",
          ],
          enabled_features: [
            "hide_left_toolbar_by_default",
          ],
          overrides: {
            "paneProperties.background": theme === "dark" ? "#131122" : "#ffffff",
            "paneProperties.backgroundType": "solid",
            "paneProperties.vertGridProperties.color": theme === "dark" ? "#1e1c30" : "#e9e9ea",
            "paneProperties.horzGridProperties.color": theme === "dark" ? "#1e1c30" : "#e9e9ea",
            "scalesProperties.backgroundColor": theme === "dark" ? "#131122" : "#ffffff",
            "scalesProperties.textColor": theme === "dark" ? "#8a86a8" : "#555",
            "scalesProperties.lineColor": theme === "dark" ? "#1e1c30" : "#e0e0e0",
            "mainSeriesProperties.candleStyle.upColor": "#2bca6a",
            "mainSeriesProperties.candleStyle.downColor": "#ec5d6f",
            "mainSeriesProperties.candleStyle.wickUpColor": "#2bca6a",
            "mainSeriesProperties.candleStyle.wickDownColor": "#ec5d6f",
            "mainSeriesProperties.candleStyle.borderUpColor": "#2bca6a",
            "mainSeriesProperties.candleStyle.borderDownColor": "#ec5d6f",
          },
          loading_screen: {
            backgroundColor: theme === "dark" ? "#131122" : "#ffffff",
            foregroundColor: theme === "dark" ? "#8e7df0" : "#3b82f6",
          },
          custom_css_url: "",
        });
      } catch (err) {
        console.error("TradingView widget init error:", err);
      }
    };

    // Load the TradingView standalone script if not already loaded
    if (!document.querySelector('script[src="/charting_library/charting_library.standalone.js"]')) {
      const script = document.createElement("script");
      script.src = "/charting_library/charting_library.standalone.js";
      script.async = true;
      script.onload = loadWidget;
      document.head.appendChild(script);
    } else {
      loadWidget();
    }

    return () => {
      cancelled = true;
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch {}
        widgetRef.current = null;
      }
    };
  }, [token, theme]);

  // Handle interval changes
  useEffect(() => {
    if (widgetRef.current) {
      try {
        widgetRef.current.onChartReady(() => {
          widgetRef.current.activeChart().setResolution(interval);
        });
      } catch {}
    }
  }, [interval]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      style={{ minHeight: 300 }}
    />
  );
}

// Add TradingView type declaration
declare global {
  interface Window {
    TradingView: any;
  }
}

export const TradingViewChart = memo(TradingViewChartInner);
