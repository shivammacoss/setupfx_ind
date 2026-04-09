import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  LuWallet, LuArrowDownLeft, LuArrowUpRight, LuTrendingUp,
  LuChevronRight, LuNewspaper, LuChartBar,
} from 'react-icons/lu';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// TradingView Heatmap Widget
function TradingViewHeatmap({ isDark }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      exchanges: [],
      dataSource: 'SPX500',
      grouping: 'sector',
      blockSize: 'market_cap_basic',
      blockColor: 'change',
      locale: 'en',
      symbolUrl: '',
      colorTheme: isDark ? 'dark' : 'light',
      hasTopBar: false,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      width: '100%',
      height: '100%',
    });
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(script);
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [isDark]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 300 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

// Market News via TradingView Timeline
function MarketNews({ isDark }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      feedMode: 'all_symbols',
      colorTheme: isDark ? 'dark' : 'light',
      isTransparent: true,
      displayMode: 'compact',
      width: '100%',
      height: '100%',
      locale: 'en',
    });
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(script);
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [isDark]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 300 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

function HomePage() {
  const ctx = useOutletContext();
  const {
    user,
    isDark,
    navigateToPage,
    walletData,
    displayCurrency,
    usdInrRate,
    usdMarkup,
  } = ctx;

  const [banners, setBanners] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const res = await fetch(`${API_URL}/api/banners/active`);
        const data = await res.json();
        if (data.banners && data.banners.length > 0) {
          setBanners(data.banners);
        }
      } catch (error) {
        console.error('Error fetching banners:', error);
      }
    };
    fetchBanners();
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const rate = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);
  const fmtBal = (v) => {
    const n = Number(v || 0);
    if (displayCurrency === 'INR') {
      return '₹' + (n * rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const bal = Number(walletData?.balance || 0);
  const equity = Number(walletData?.equity || 0);
  const freeMargin = Number(walletData?.freeMargin || 0);

  const cardStyle = {
    background: 'var(--bg-secondary)',
    borderRadius: '14px',
    padding: '20px',
    border: '1px solid var(--border-color)',
  };

  const quickActionRow = (icon, color, label, onClick) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        padding: '14px 16px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: color + '18',
        border: `1px solid ${color}40`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{label}</span>
      <LuChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
    </button>
  );

  return (
    <div style={{ padding: '16px', maxWidth: 1200 }}>
      {/* Banner Carousel */}
      {banners.length > 0 && (
        <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 20, position: 'relative', height: 180 }}>
          {banners.map((banner, index) => (
            <img
              key={banner._id}
              src={banner.imageData || banner.imageUrl}
              alt=""
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: index === currentSlide ? 1 : 0,
                transition: 'opacity 0.5s',
              }}
            />
          ))}
          {banners.length > 1 && (
            <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
              {banners.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  style={{
                    width: i === currentSlide ? 20 : 8,
                    height: 8,
                    borderRadius: 4,
                    border: 'none',
                    background: i === currentSlide ? '#fff' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    transition: 'width 0.3s',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Two-column grid: left (accounts + quick actions) | right (heatmap) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* USD Account Card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>USD Account</span>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 6,
                background: equity >= bal ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: equity >= bal ? '#10b981' : '#ef4444',
              }}>
                {equity >= bal ? '+' : ''}{bal > 0 ? (((equity - bal) / bal) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
              ${Number(bal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Free Margin</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>${Number(freeMargin).toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Equity</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>${Number(equity).toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* INR Account Card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>INR Account</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>1 USD = ₹{rate.toFixed(2)}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>
              ₹{(bal * rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Free Margin</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>₹{(freeMargin * rate).toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Equity</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>₹{(equity * rate).toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Quick Actions</h3>
            {quickActionRow(<LuArrowDownLeft size={20} />, '#16a34a', 'Deposit Funds', () => navigateToPage('wallet'))}
            {quickActionRow(<LuArrowUpRight size={20} />, '#ef4444', 'Withdraw Profits', () => navigateToPage('wallet'))}
          </div>
        </div>

        {/* Right Column — Market Heatmap */}
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', minHeight: 400 }}>
          <div style={{ padding: '14px 16px 8px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <LuChartBar size={16} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Market Heatmap</span>
          </div>
          <div style={{ height: 'calc(100% - 44px)' }}>
            <TradingViewHeatmap isDark={isDark} />
          </div>
        </div>
      </div>

      {/* Market News */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <LuNewspaper size={16} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Market News & Updates</span>
        </div>
        <div style={{ height: 350 }}>
          <MarketNews isDark={isDark} />
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .home-grid-two-col {
            grid-template-columns: 1fr !important;
          }
          .deposit-btn-text { display: none; }
        }
      `}</style>
    </div>
  );
}

export default HomePage;
