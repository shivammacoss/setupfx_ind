import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// TradingView Heatmap Widget Component
function TradingViewHeatmap({ isDark }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "exchanges": [],
      "dataSource": "SPX500",
      "grouping": "sector",
      "blockSize": "market_cap_basic",
      "blockColor": "change",
      "locale": "en",
      "symbolUrl": "",
      "colorTheme": isDark ? "dark" : "light",
      "hasTopBar": false,
      "isDataSet498": true,
      "isZoomEnabled": true,
      "hasSymbolTooltip": true,
      "width": "100%",
      "height": "100%"
    });

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [isDark]);

  // Mandatory TradingView attribution: visible credit + direct link (same as public home in App.jsx)
  return (
    <div className="tradingview-widget-wrapper">
      <div ref={containerRef} className="tradingview-widget" />
      <div className="tradingview-attribution">
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Stock Heatmap by TradingView
        </a>
      </div>
    </div>
  );
}

// Quick Wallet Actions Component
function QuickWalletActions({ user, displayCurrency, usdInrRate, usdMarkup }) {
  const [userWallet, setUserWallet] = useState(null);
  
  // Helper to format currency based on user preference
  const formatCurrency = (value) => {
    const numValue = Number(value || 0);
    const rate = (usdInrRate || 83) + (usdMarkup || 0);
    if (displayCurrency === 'INR') {
      return `₹${(numValue * rate).toFixed(2)}`;
    }
    return `$${numValue.toFixed(2)}`;
  };
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [proofImage, setProofImage] = useState('');
  const [withdrawDetails, setWithdrawDetails] = useState('');
  const [paymentMethods, setPaymentMethods] = useState({ bankAccounts: [], upiIds: [], cryptoWallets: [] });
  const [withdrawMethod, setWithdrawMethod] = useState('bank');
  const [withdrawBankDetails, setWithdrawBankDetails] = useState({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '' });
  const [withdrawUpiDetails, setWithdrawUpiDetails] = useState({ upiId: '', name: '' });
  const [withdrawCryptoDetails, setWithdrawCryptoDetails] = useState({ network: '', address: '' });

  const fetchWallet = async () => {
    try {
      // Get user ID from props or localStorage
      const userId = user?.oderId || user?.id;
      if (!userId) {
        const userData = JSON.parse(localStorage.getItem('sSetupFX-user') || '{}');
        const fallbackUserId = userData?.oderId || userData?.id;
        if (!fallbackUserId) return;
        
        const response = await fetch(`${API_URL}/api/user/wallet/${fallbackUserId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.wallet) {
            setUserWallet({
              balance: Number(data.wallet.balance) || 0,
              credit: Number(data.wallet.credit) || 0,
              equity: Number(data.wallet.equity) || 0,
              margin: Number(data.wallet.margin) || 0,
              freeMargin: Number(data.wallet.freeMargin) || 0
            });
          }
        }
        return;
      }

      // Use the direct user wallet endpoint (same as WalletPage)
      const response = await fetch(`${API_URL}/api/user/wallet/${userId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.wallet) {
          setUserWallet({
            balance: Number(data.wallet.balance) || 0,
            credit: Number(data.wallet.credit) || 0,
            equity: Number(data.wallet.equity) || 0,
            margin: Number(data.wallet.margin) || 0,
            freeMargin: Number(data.wallet.freeMargin) || 0
          });
        }
      }
    } catch (err) {
      console.error('Error fetching wallet:', err);
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin-payment-details`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPaymentMethods({
            bankAccounts: data.bankAccounts || [],
            upiIds: data.upiIds || [],
            cryptoWallets: data.cryptoWallets || []
          });
        }
      }
    } catch (err) {
      console.error('Error fetching payment methods:', err);
    }
  };

  useEffect(() => {
    fetchWallet();
    fetchPaymentMethods();
  }, [user]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProofImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const getAllPaymentMethods = () => {
    const methods = [];
    paymentMethods.bankAccounts?.forEach(acc => {
      methods.push({ id: `bank_${acc.id}`, type: 'bank', name: `${acc.bankName} - ${acc.accountNumber}`, details: acc, icon: '🏦' });
    });
    paymentMethods.upiIds?.forEach(upi => {
      methods.push({ id: `upi_${upi.id}`, type: 'upi', name: upi.upiId, details: upi, icon: '📱' });
    });
    paymentMethods.cryptoWallets?.forEach(wallet => {
      methods.push({ id: `crypto_${wallet.id}`, type: 'crypto', name: `${wallet.network} - ${wallet.address.slice(0, 8)}...`, details: wallet, icon: '₿' });
    });
    return methods;
  };

  const getSelectedMethod = () => {
    const allMethods = getAllPaymentMethods();
    return allMethods.find(m => m.id === paymentMethod);
  };

  const submitDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!paymentMethod) {
      alert('Please select a payment method');
      return;
    }
    if (!proofImage) {
      alert('Please upload payment proof');
      return;
    }

    const selectedMethod = getSelectedMethod();
    const userId = user?.id || user?.oderId;

    try {
      const response = await fetch(`${API_URL}/api/transactions/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: parseFloat(amount),
          method: paymentMethod,
          methodDetails: selectedMethod?.details,
          proofImage
        })
      });

      const result = await response.json();
      if (result.success) {
        alert('Deposit request submitted successfully!');
        setShowDepositModal(false);
        setAmount('');
        setPaymentMethod('');
        setProofImage('');
        fetchWallet();
      } else {
        alert(result.error || 'Failed to submit deposit');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const submitWithdraw = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (userWallet && parseFloat(amount) > userWallet.freeMargin) {
      alert('Insufficient balance');
      return;
    }

    // Validate user-entered withdrawal details based on method
    let userWithdrawDetails = {};
    if (withdrawMethod === 'bank') {
      if (!withdrawBankDetails.bankName || !withdrawBankDetails.accountNumber || !withdrawBankDetails.ifsc || !withdrawBankDetails.accountHolder) {
        alert('Please fill all bank details');
        return;
      }
      userWithdrawDetails = { type: 'bank', ...withdrawBankDetails };
    } else if (withdrawMethod === 'upi') {
      if (!withdrawUpiDetails.upiId || !withdrawUpiDetails.name) {
        alert('Please fill UPI details');
        return;
      }
      userWithdrawDetails = { type: 'upi', ...withdrawUpiDetails };
    } else if (withdrawMethod === 'crypto') {
      if (!withdrawCryptoDetails.network || !withdrawCryptoDetails.address) {
        alert('Please fill crypto wallet details');
        return;
      }
      userWithdrawDetails = { type: 'crypto', ...withdrawCryptoDetails };
    }

    const userId = user?.id || user?.oderId;

    try {
      const response = await fetch(`${API_URL}/api/transactions/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: parseFloat(amount),
          method: withdrawMethod,
          withdrawDetails: userWithdrawDetails
        })
      });

      const result = await response.json();
      if (result.success) {
        alert('Withdrawal request submitted successfully!');
        setShowWithdrawModal(false);
        setAmount('');
        setWithdrawMethod('bank');
        setWithdrawBankDetails({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '' });
        setWithdrawUpiDetails({ upiId: '', name: '' });
        setWithdrawCryptoDetails({ network: '', address: '' });
        fetchWallet();
      } else {
        alert(result.error || 'Failed to submit withdrawal');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="quick-wallet">
      <div className="quick-balance-card">
        <div className="balance-row">
          <span className="balance-label">Balance</span>
          <span className="balance-value">{formatCurrency(userWallet?.balance)}</span>
        </div>
        <div className="balance-row">
          <span className="balance-label">Free Margin</span>
          <span className="balance-value">{formatCurrency(userWallet?.freeMargin)}</span>
        </div>
        <div className="balance-row">
          <span className="balance-label">Equity</span>
          <span className="balance-value">{formatCurrency(userWallet?.equity)}</span>
        </div>
      </div>

      <div className="quick-action-buttons">
        <button className="quick-action-btn deposit" onClick={() => setShowDepositModal(true)}>
          <span className="btn-icon">↓</span>
          <span>Deposit</span>
        </button>
        <button className="quick-action-btn withdraw" onClick={() => setShowWithdrawModal(true)}>
          <span className="btn-icon">↑</span>
          <span>Withdraw</span>
        </button>
      </div>

      {showDepositModal && (
        <div className="quick-modal-overlay" onClick={() => setShowDepositModal(false)}>
          <div className="quick-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Deposit Funds</h4>
              <button className="close-btn" onClick={() => setShowDepositModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Amount ($)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" min="0" />
              </div>
              <div className="form-group">
                <label>Select Payment Method</label>
                {getAllPaymentMethods().length === 0 ? (
                  <p className="no-methods">No payment methods available. Contact admin.</p>
                ) : (
                  <div className="payment-methods-list">
                    {getAllPaymentMethods().map(m => (
                      <button key={m.id} className={`payment-method-item ${paymentMethod === m.id ? 'selected' : ''}`} onClick={() => setPaymentMethod(m.id)}>
                        <span className="method-icon">{m.icon}</span>
                        <span className="method-name">{m.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {getSelectedMethod() && (
                <div className="selected-method-details">
                  <h5>Payment Details</h5>
                  {getSelectedMethod().type === 'bank' && (
                    <div className="method-info">
                      <p><strong>Bank:</strong> {getSelectedMethod().details.bankName}</p>
                      <p><strong>Account:</strong> {getSelectedMethod().details.accountNumber}</p>
                      <p><strong>IFSC:</strong> {getSelectedMethod().details.ifscCode}</p>
                      <p><strong>Name:</strong> {getSelectedMethod().details.accountName}</p>
                    </div>
                  )}
                  {getSelectedMethod().type === 'upi' && (
                    <div className="method-info">
                      <p><strong>UPI ID:</strong> {getSelectedMethod().details.upiId}</p>
                      {getSelectedMethod().details.qrCode && (
                        <img src={getSelectedMethod().details.qrCode} alt="QR" className="qr-code" />
                      )}
                    </div>
                  )}
                  {getSelectedMethod().type === 'crypto' && (
                    <div className="method-info">
                      <p><strong>Network:</strong> {getSelectedMethod().details.network}</p>
                      <p><strong>Address:</strong> <span className="crypto-addr">{getSelectedMethod().details.address}</span></p>
                    </div>
                  )}
                </div>
              )}
              <div className="form-group">
                <label>Upload Payment Proof</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} />
                {proofImage && <img src={proofImage} alt="Proof" className="proof-preview" />}
              </div>
              <button className="submit-btn" onClick={submitDeposit}>Submit Deposit</button>
            </div>
          </div>
        </div>
      )}

      {showWithdrawModal && (
        <div className="quick-modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="quick-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Withdraw Funds</h4>
              <button className="close-btn" onClick={() => setShowWithdrawModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Amount ($) - Available: ${Number(userWallet?.freeMargin || 0).toFixed(2)}</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" min="0" max={userWallet?.freeMargin || 0} />
              </div>
              <div className="form-group">
                <label>Withdrawal Method</label>
                <div className="payment-methods-list" style={{ display: 'flex', gap: 8 }}>
                  <button className={`payment-method-item ${withdrawMethod === 'bank' ? 'selected' : ''}`} onClick={() => setWithdrawMethod('bank')} style={{ flex: 1 }}>
                    <span className="method-icon">🏦</span>
                    <span className="method-name">Bank</span>
                  </button>
                  <button className={`payment-method-item ${withdrawMethod === 'upi' ? 'selected' : ''}`} onClick={() => setWithdrawMethod('upi')} style={{ flex: 1 }}>
                    <span className="method-icon">📱</span>
                    <span className="method-name">UPI</span>
                  </button>
                  <button className={`payment-method-item ${withdrawMethod === 'crypto' ? 'selected' : ''}`} onClick={() => setWithdrawMethod('crypto')} style={{ flex: 1 }}>
                    <span className="method-icon">₿</span>
                    <span className="method-name">Crypto</span>
                  </button>
                </div>
              </div>
              
              {withdrawMethod === 'bank' && (
                <div className="withdraw-details-form">
                  <div className="form-group">
                    <label>Bank Name *</label>
                    <input type="text" value={withdrawBankDetails.bankName} onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, bankName: e.target.value }))} placeholder="Enter bank name" />
                  </div>
                  <div className="form-group">
                    <label>Account Number *</label>
                    <input type="text" value={withdrawBankDetails.accountNumber} onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, accountNumber: e.target.value }))} placeholder="Enter account number" />
                  </div>
                  <div className="form-group">
                    <label>IFSC Code *</label>
                    <input type="text" value={withdrawBankDetails.ifsc} onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, ifsc: e.target.value }))} placeholder="Enter IFSC code" />
                  </div>
                  <div className="form-group">
                    <label>Account Holder Name *</label>
                    <input type="text" value={withdrawBankDetails.accountHolder} onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, accountHolder: e.target.value }))} placeholder="Enter account holder name" />
                  </div>
                </div>
              )}
              
              {withdrawMethod === 'upi' && (
                <div className="withdraw-details-form">
                  <div className="form-group">
                    <label>UPI ID *</label>
                    <input type="text" value={withdrawUpiDetails.upiId} onChange={(e) => setWithdrawUpiDetails(prev => ({ ...prev, upiId: e.target.value }))} placeholder="Enter UPI ID (e.g. name@upi)" />
                  </div>
                  <div className="form-group">
                    <label>Name *</label>
                    <input type="text" value={withdrawUpiDetails.name} onChange={(e) => setWithdrawUpiDetails(prev => ({ ...prev, name: e.target.value }))} placeholder="Enter your name" />
                  </div>
                </div>
              )}
              
              {withdrawMethod === 'crypto' && (
                <div className="withdraw-details-form">
                  <div className="form-group">
                    <label>Network *</label>
                    <input type="text" value={withdrawCryptoDetails.network} onChange={(e) => setWithdrawCryptoDetails(prev => ({ ...prev, network: e.target.value }))} placeholder="Enter network (e.g. TRC20, ERC20)" />
                  </div>
                  <div className="form-group">
                    <label>Wallet Address *</label>
                    <input type="text" value={withdrawCryptoDetails.address} onChange={(e) => setWithdrawCryptoDetails(prev => ({ ...prev, address: e.target.value }))} placeholder="Enter wallet address" />
                  </div>
                </div>
              )}
              
              <button className="submit-btn" onClick={submitWithdraw}>Submit Withdrawal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Market News Component
function MarketNews() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://finnhub.io/api/v1/news?category=general&token=demo');
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        setNews(data.slice(0, 12));
      } else {
        setNews(getSampleNews());
      }
    } catch (error) {
      console.error('Error fetching news:', error);
      setNews(getSampleNews());
    } finally {
      setLoading(false);
    }
  };

  const getSampleNews = () => [
    { id: 1, headline: 'Gold Prices Surge Amid Global Uncertainty', summary: 'Gold prices reached new highs as investors seek safe-haven assets.', image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=400', source: 'Market Watch', datetime: Date.now() / 1000 - 3600, url: '#', category: 'commodities' },
    { id: 2, headline: 'Fed Signals Potential Rate Cuts in 2026', summary: 'Federal Reserve officials hint at possible interest rate reductions.', image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400', source: 'Reuters', datetime: Date.now() / 1000 - 7200, url: '#', category: 'forex' },
    { id: 3, headline: 'Bitcoin Breaks $100K Resistance Level', summary: 'Cryptocurrency markets rally as Bitcoin surpasses key barrier.', image: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=400', source: 'CoinDesk', datetime: Date.now() / 1000 - 10800, url: '#', category: 'crypto' },
    { id: 4, headline: 'Tech Stocks Lead Market Rally', summary: 'Major technology companies drive gains in US equity markets.', image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400', source: 'Bloomberg', datetime: Date.now() / 1000 - 14400, url: '#', category: 'stocks' },
    { id: 5, headline: 'EUR/USD Volatility Increases on ECB Decision', summary: 'European Central Bank policy announcement sparks currency movements.', image: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400', source: 'FX Street', datetime: Date.now() / 1000 - 18000, url: '#', category: 'forex' },
    { id: 6, headline: 'Oil Prices Stabilize After OPEC Meeting', summary: 'Crude oil markets find balance following production discussions.', image: 'https://images.unsplash.com/photo-1513828583688-c52646db42da?w=400', source: 'Energy News', datetime: Date.now() / 1000 - 21600, url: '#', category: 'commodities' }
  ];

  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60);
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const categories = ['all', 'forex', 'crypto', 'stocks', 'commodities'];
  const filteredNews = activeCategory === 'all' ? news : news.filter(item => item.category === activeCategory);

  return (
    <div className="market-news">
      <div className="news-categories">
        {categories.map(cat => (
          <button key={cat} className={`category-btn ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="news-loading">Loading market news...</div>
      ) : (
        <div className="news-grid">
          {filteredNews.map((item, index) => (
            <a key={item.id || index} href={item.url} target="_blank" rel="noopener noreferrer" className="news-card">
              <div className="news-image">
                <img src={item.image || 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400'} alt={item.headline} onError={(e) => e.target.src = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400'} />
                {item.isVideo && (
                  <div className="video-overlay">
                    <span className="play-icon">▶</span>
                  </div>
                )}
              </div>
              <div className="news-content">
                <h4 className="news-headline">{item.headline}</h4>
                <p className="news-summary">{item.summary}</p>
                <div className="news-meta">
                  <span className="news-source">{item.source}</span>
                  <span className="news-time">{formatTime(item.datetime)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      <div className="youtube-section">
        <h4 className="youtube-title">📚 Trading Education</h4>

        <div className="video-category">
          <h5 className="category-title">🎯 Trading Basics</h5>
          <div className="youtube-grid">
            <div className="youtube-card">
              <iframe src="https://www.youtube.com/embed/p7HKvqRI_Bo" title="Stock Market Explained" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">Stock Market Explained (Whiteboard)</span></div>
            </div>
            <div className="youtube-card">
              <iframe src="https://www.youtube.com/embed/ZCFkWDdmXG8" title="Investing For Beginners" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">Investing For Beginners (Graham Stephan)</span></div>
            </div>
          </div>
        </div>

        <div className="video-category">
          <h5 className="category-title">₿ Cryptocurrency</h5>
          <div className="youtube-grid">
            <div className="youtube-card">
              <iframe src="https://www.youtube.com/embed/bBC-nXj3Ng4" title="How Bitcoin Works" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">But How Does Bitcoin Actually Work? (3Blue1Brown)</span></div>
            </div>
            <div className="youtube-card">
              <iframe src="https://www.youtube.com/embed/Yb6825iv0Vk" title="Crypto Explained" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">Cryptocurrency Explained (Simply Explained)</span></div>
            </div>
          </div>
        </div>

        <div className="video-category">
          <h5 className="category-title">📊 Technical Analysis</h5>
          <div className="youtube-grid">
            <div className="youtube-card">
              <iframe src="https://www.youtube.com/embed/08R_TJhAOGo" title="Technical Analysis" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">The Only Technical Analysis Video You Need</span></div>
            </div>
            <div className="youtube-card">
              <iframe src="https://www.youtube.com/embed/MN3-HJ-pPrg" title="EMA Strategy" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              <div className="video-info"><span className="video-title">The FASTEST & Most AGGRESSIVE EMA Strategy</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main HomePage Component
function HomePage() {
  const {
    user,
    isDark,
    displayCurrency,
    usdInrRate,
    usdMarkup,
    walletData,
    livePrices,
    watchlist,
    setSelectedSymbol,
    navigateToPage,
    isMetaApiConnected,
    totalPnL
  } = useOutletContext();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [banners, setBanners] = useState([]);

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
      setCurrentSlide(prev => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [banners.length]);

  // Calculate days remaining for demo account
  const getDemoCountdown = () => {
    if (!user?.isDemo || !user?.demoExpiresAt) return null;
    const now = new Date();
    const expiry = new Date(user.demoExpiresAt);
    const diffMs = expiry - now;
    if (diffMs <= 0) return { days: 0, hours: 0, expired: true };
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return { days, hours, expired: false };
  };

  const handleConvertToReal = async () => {
    if (!confirm('Convert to real account? Your wallet will be reset to zero.')) return;
    try {
      const token = localStorage.getItem('sSetupFX-token');
      const res = await fetch(`${API_URL}/api/auth/convert-to-real`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert('Account converted successfully! Please login again.');
        localStorage.removeItem('sSetupFX-token');
        localStorage.removeItem('sSetupFX-user');
        window.location.href = '/login';
      } else {
        alert(data.error || 'Failed to convert account');
      }
    } catch (err) {
      alert('Error converting account');
    }
  };

  const demoCountdown = getDemoCountdown();

  const rate = (usdInrRate || 83) + (usdMarkup || 0);
  const n = (v) => Number(v || 0);
  const fmtMoney = (usdVal) => {
    const x = n(usdVal);
    if (displayCurrency === 'INR') return `₹${(x * rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    if (x >= 1e6) return `$${(x / 1e6).toFixed(2)}M`;
    if (x >= 1e3) return `$${(x / 1e3).toFixed(2)}K`;
    return `$${x.toFixed(2)}`;
  };
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,';
  const initials = (user?.name || 'U')
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const wlSymbols =
    watchlist && watchlist.length > 0
      ? watchlist.slice(0, 8)
      : ['XAUUSD', 'EURUSD', 'BTCUSD', 'GBPUSD', 'USDJPY'];

  const pickQuote = (sym) => {
    const q = livePrices?.[sym];
    if (!q) return { bid: 0, ask: 0, mid: 0 };
    const bid = n(q.bid);
    const ask = n(q.ask);
    const mid = bid && ask ? (bid + ask) / 2 : n(q.lastPrice || q.last || 0);
    return { bid, ask, mid };
  };

  return (
    <div className="home-page">
      {/* Demo Account Banner */}
      {user?.isDemo && demoCountdown && (
        <div style={{
          background: demoCountdown.expired 
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.1))'
            : 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.1))',
          border: `1px solid ${demoCountdown.expired ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '32px' }}>🎮</div>
            <div>
              <h3 style={{ 
                margin: '0 0 4px', 
                fontSize: '16px', 
                fontWeight: 600,
                color: demoCountdown.expired ? '#ef4444' : '#f59e0b'
              }}>
                {demoCountdown.expired ? 'Demo Account Expired' : 'Demo Account'}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                {demoCountdown.expired 
                  ? 'Your demo account has expired. Convert to continue trading.'
                  : `${demoCountdown.days} days ${demoCountdown.hours} hours remaining`
                }
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!demoCountdown.expired && (
              <div style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center'
              }}>
                <div style={{
                  background: 'rgba(245, 158, 11, 0.2)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>{demoCountdown.days}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>DAYS</div>
                </div>
                <div style={{
                  background: 'rgba(245, 158, 11, 0.2)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>{demoCountdown.hours}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>HOURS</div>
                </div>
              </div>
            )}
            <button 
              onClick={handleConvertToReal}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              🚀 Convert to Real Account
            </button>
          </div>
        </div>
      )}

      <div className="mobi-home-dashboard">
        <div className="mobi-s1-hero">
          <div className="mobi-s1-topbar">
            <div>
              <div className="mobi-s1-greeting">{greet}</div>
              <div className="mobi-s1-name">{user?.name || 'Trader'} 👋</div>
            </div>
            <div className="mobi-s1-actions">
              <button
                type="button"
                className="mobi-notif-btn"
                aria-label="Notifications"
                onClick={() => navigateToPage('settings')}
              >
                🔔
              </button>
              <div className="mobi-s1-avatar">{initials}</div>
            </div>
          </div>
          <div className="mobi-portfolio-card">
            <div className="mobi-pc-label">Portfolio value</div>
            <div className="mobi-pc-amount">{fmtMoney(walletData?.equity)}</div>
            <div className="mobi-pc-sub">
              {displayCurrency === 'INR' ? 'INR' : 'USD'} · 1 USD = ₹{rate.toFixed(2)}
              {isMetaApiConnected && <span className="mobi-live-pill">● LIVE</span>}
            </div>
            <div className="mobi-pc-row">
              <div>
                <div className="mobi-pc-stat-label">Equity</div>
                <div className="mobi-pc-stat-val">{fmtMoney(walletData?.equity)}</div>
              </div>
              <div>
                <div className="mobi-pc-stat-label">Free margin</div>
                <div className="mobi-pc-stat-val">{fmtMoney(walletData?.freeMargin)}</div>
              </div>
              <div>
                <div className="mobi-pc-stat-label">Open P/L</div>
                <div
                  className="mobi-pc-stat-val"
                  style={{ color: n(totalPnL) >= 0 ? 'var(--m-green, #00d68f)' : 'var(--m-red, #f24040)' }}
                >
                  {n(totalPnL) >= 0 ? '+' : '-'}
                  {displayCurrency === 'INR'
                    ? `₹${(Math.abs(n(totalPnL)) * rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                    : `$${Math.abs(n(totalPnL)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mobi-quick-actions">
          <button type="button" className="mobi-qa-btn" onClick={() => navigateToPage('wallet')}>
            <span className="mobi-qa-icon blue">↓</span>
            <span className="mobi-qa-label">Deposit</span>
          </button>
          <button type="button" className="mobi-qa-btn" onClick={() => navigateToPage('wallet')}>
            <span className="mobi-qa-icon red">↑</span>
            <span className="mobi-qa-label">Withdraw</span>
          </button>
          <button
            type="button"
            className="mobi-qa-btn"
            onClick={() => {
              navigateToPage('market');
            }}
          >
            <span className="mobi-qa-icon green">📊</span>
            <span className="mobi-qa-label">Markets</span>
          </button>
        </div>

        <div className="mobi-market-list">
          <div className="mobi-section-head">
            <span className="mobi-section-title">Watchlist</span>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--m-blue-l, #4d8eff)',
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif"
              }}
              onClick={() => navigateToPage('market')}
            >
              See all
            </button>
          </div>
          {wlSymbols.map((sym) => {
            const { mid } = pickQuote(sym);
            return (
              <button
                key={sym}
                type="button"
                className="mobi-mkt-item"
                onClick={() => {
                  setSelectedSymbol(sym);
                  navigateToPage('market');
                }}
              >
                <div className="mobi-mkt-icon">📈</div>
                <div>
                  <div className="mobi-mkt-name">{sym}</div>
                  <div className="mobi-mkt-sub">Spot / CFD</div>
                </div>
                <div>
                  <div className="mobi-mkt-price">
                    {mid > 0 ? (sym.includes('JPY') ? mid.toFixed(3) : mid.toFixed(sym.length > 8 ? 4 : 5)) : '—'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="home-desktop-block">
      <div className="banner-carousel">
        {banners.length === 0 ? (
          <div className="default-banner">
            <div className="banner-content">
              <h2>WELCOME TO SetupFX</h2>
              <p>THE BEST CHOICE FOR FUTURE TRADING</p>
            </div>
          </div>
        ) : (
          <>
            <div className="banner-slides">
              {banners.map((banner, index) => (
                <div key={banner._id} className={`banner-slide ${index === currentSlide ? 'active' : ''}`}>
                  <img src={banner.imageData || banner.imageUrl} alt="" />
                </div>
              ))}
            </div>
            {banners.length > 1 && (
              <div className="banner-dots">
                {banners.map((_, index) => (
                  <button key={index} className={`dot ${index === currentSlide ? 'active' : ''}`} onClick={() => setCurrentSlide(index)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="home-widgets-section">
        <div className="widget-box">
          <h3 className="widget-title">Market Heatmap</h3>
          <div className="tradingview-widget-container">
            <TradingViewHeatmap isDark={isDark} />
          </div>
        </div>
        <div className="widget-box">
          <h3 className="widget-title">Quick Actions</h3>
          <div className="quick-wallet-container">
            <QuickWalletActions user={user} displayCurrency={displayCurrency} usdInrRate={usdInrRate} usdMarkup={usdMarkup} />
          </div>
        </div>
      </div>

      <div className="home-news-section">
        <h3 className="section-title">Market News & Updates</h3>
        <MarketNews />
      </div>
      </div>
    </div>
  );
}

export default HomePage;
