import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/themes.css';
import './App.css';
import './styles/mobile-setupfx.css';
import { useMetaApiPrices, getOneClickTradeButtonStyle, isOneClickSymbolBusy } from './hooks/useMetaApiPrices';
import tradingSounds from './utils/sounds';
import { useZerodhaTicks } from './hooks/useZerodhaTicks';
import AdminLayout from './pages/Admin/AdminLayout';
import {
  Dashboard,
  MarketWatch,
  UserManagement,
  TradeManagement,
  FundManagement,
  ChargeManagement,
  AdminManagement,
  BrandManagement,
  IBManagement,
  CopyTradeManagement,
  DemoSettings,
  BinarySettings,
  RiskManagement,
  HedgingSegmentSettings,
  NettingSegmentSettings,
  ZerodhaConnect,
  MarketControl,
  Reports,
  Notifications,
  Settings,
  ReboorderSettings,
  PnlSharing
} from './pages/Admin/pages';
import UserLayout from './pages/User/UserLayout';
import {
  mergeWatchlistBrokerVariants,
  stripBrokerInstrumentSuffix,
  canonicalBrokerSymbolForBase,
  isBrokerVariantInWatchlist
} from './utils/brokerSymbolUtils';
import {
  HomePage,
  MarketPage,
  OrdersPage,
  WalletPage as UserWalletPage,
  SettingsPage as UserSettingsPage,
  BusinessPage,
  MastersPage
} from './pages/User/pages';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import Terms from './pages/Auth/Terms';
import PrivacyPolicy from './pages/Legal/PrivacyPolicy';
import RefundPolicy from './pages/Legal/RefundPolicy';
import RiskDisclaimer from './pages/Legal/RiskDisclaimer';
import NewLandingPage from './pages/Landing/NewLandingPage';
import SubAdminLogin from './pages/Admin/SubAdminLogin';
import BrokerLogin from './pages/Admin/BrokerLogin';
import SubAdminLayout from './pages/SubAdmin/SubAdminLayout';
import { SubAdminDashboard, SubAdminUsers, SubAdminBrokers, SubAdminWallet, SubAdminTrades, SubAdminFunds, SubAdminBrokerFunds, SubAdminBankManagement, SubAdminSettings, SubAdminPnlSharing } from './pages/SubAdmin/pages';
import BrokerLayout from './pages/Broker/BrokerLayout';
import { BrokerDashboard, BrokerUsers, BrokerWallet, BrokerTrades, BrokerFunds, BrokerBankManagement, BrokerSettings, BrokerPnlSharing } from './pages/Broker/pages';
import { instrumentsByCategory, allInstruments } from './pages/User/userConfig';
// TradingView chart is used - embedded via script

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Wallet Page Component
function WalletPage({ user }) {
  const [activeTab, setActiveTab] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [proofImage, setProofImage] = useState('');
  const [withdrawDetails, setWithdrawDetails] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState({ bankAccounts: [], upiIds: [], cryptoWallets: [] });
  const [userWallet, setUserWallet] = useState({ balance: 0, credit: 0, equity: 0, margin: 0, freeMargin: 0 });
  const [uploadedHashes, setUploadedHashes] = useState([]);
  const [usdInrRate, setUsdInrRate] = useState(83);
  const [usdMarkup, setUsdMarkup] = useState(0);

  // Fetch wallet from server API
  const fetchWalletFromServer = async () => {
    // Try to get user ID from prop or localStorage
    const userId = user?.id || user?.oderId || JSON.parse(localStorage.getItem('SetupFX-auth') || '{}')?.user?.id;
    if (!userId) {
      console.log('No user ID available for wallet fetch');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/wallet/${userId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.wallet) {
          setUserWallet({
            balance: Number(data.wallet.balance) || 0,
            credit: Number(data.wallet.credit) || 0,
            equity: Number(data.wallet.equity) || 0,
            margin: Number(data.wallet.margin) || 0,
            freeMargin: Number(data.wallet.freeMargin) || 0
          });
        }
      }
    } catch (error) {
      console.error('Error fetching wallet:', error);
    }
  };

  // Fetch transactions from server
  const fetchTransactionsFromServer = async () => {
    const userId = user?.id || user?.oderId || JSON.parse(localStorage.getItem('SetupFX-auth') || '{}')?.user?.id;
    if (!userId) return;
    try {
      const response = await fetch(`${API_URL}/api/transactions/${userId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.transactions) {
          setTransactions(data.transactions);
        }
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  useEffect(() => {
    // Fetch wallet from server
    fetchWalletFromServer();

    // Fetch transactions from server
    fetchTransactionsFromServer();

    // Load payment methods from server or localStorage
    const loadPaymentMethods = async () => {
      try {
        const response = await fetch(`${API_URL}/api/payment-methods`);
        if (response.ok) {
          const data = await response.json();
          if (data.methods) {
            const banks = data.methods.filter(m => m.type === 'bank');
            const upis = data.methods.filter(m => m.type === 'upi');
            const cryptos = data.methods.filter(m => m.type === 'crypto');
            setPaymentMethods({
              bankAccounts: banks,
              upiIds: upis,
              cryptoWallets: cryptos
            });
          }
        }
      } catch (error) {
        // Fallback to localStorage
        const raw = JSON.parse(localStorage.getItem('SetupFX-payment-methods') || '{}');
        setPaymentMethods({
          bankAccounts: Array.isArray(raw.bankAccounts) ? raw.bankAccounts : [],
          upiIds: Array.isArray(raw.upiIds) ? raw.upiIds : [],
          cryptoWallets: Array.isArray(raw.cryptoWallets) ? raw.cryptoWallets : []
        });
      }
    };
    loadPaymentMethods();

    // Load uploaded image hashes to prevent duplicates
    const hashes = JSON.parse(localStorage.getItem('SetupFX-uploaded-hashes') || '[]');
    setUploadedHashes(hashes);

    // Load currency settings from admin
    const currencySettings = JSON.parse(localStorage.getItem('SetupFX-currency-settings') || '{"usdMarkup":0}');
    setUsdMarkup(currencySettings.usdMarkup || 0);

    // Fetch live USD/INR rate
    const fetchUsdRate = async () => {
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data.rates && data.rates.INR) {
          setUsdInrRate(data.rates.INR);
        }
      } catch (error) {
        console.log('Using fallback USD rate');
        setUsdInrRate(83);
      }
    };
    fetchUsdRate();

    // Refresh wallet every 5 seconds
    const walletInterval = setInterval(fetchWalletFromServer, 5000);
    const rateInterval = setInterval(fetchUsdRate, 60000);

    return () => {
      clearInterval(walletInterval);
      clearInterval(rateInterval);
    };
  }, [user]);

  // Generate hash from image data to check duplicates
  const generateHash = async (data) => {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleProofUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        // Check for duplicate
        const hash = await generateHash(base64);
        if (uploadedHashes.includes(hash)) {
          alert('This screenshot has already been used. Please upload a new payment proof.');
          return;
        }
        setProofImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const submitRequest = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!paymentMethod) {
      alert('Please select a payment method');
      return;
    }
    if (activeTab === 'deposit' && !proofImage) {
      alert('Please upload payment proof screenshot');
      return;
    }
    if (activeTab === 'withdrawal') {
      if (parseFloat(amount) > userWallet.freeMargin) {
        alert('Insufficient balance for withdrawal');
        return;
      }
      if (!withdrawDetails) {
        alert('Please enter withdrawal details (account/wallet address)');
        return;
      }
    }

    // Save image hash to prevent reuse
    if (proofImage) {
      const hash = await generateHash(proofImage);
      const updatedHashes = [...uploadedHashes, hash];
      setUploadedHashes(updatedHashes);
      localStorage.setItem('SetupFX-uploaded-hashes', JSON.stringify(updatedHashes));
    }

    const newRequest = {
      id: Date.now().toString(),
      userId: user?.id,
      userName: user?.name || 'User',
      type: activeTab,
      amount: parseFloat(amount),
      method: paymentMethod,
      proofImage: activeTab === 'deposit' ? proofImage : null,
      withdrawDetails: activeTab === 'withdrawal' ? withdrawDetails : null,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const requests = JSON.parse(localStorage.getItem('SetupFX-fund-requests') || '[]');
    requests.push(newRequest);
    localStorage.setItem('SetupFX-fund-requests', JSON.stringify(requests));

    setTransactions([...transactions, newRequest]);
    setAmount('');
    setPaymentMethod('');
    setProofImage('');
    setWithdrawDetails('');
    alert(`${activeTab === 'deposit' ? 'Deposit' : 'Withdrawal'} request submitted successfully!`);
  };

  const getMethodDetails = (methodId) => {
    const bank = paymentMethods.bankAccounts.find(b => b.id === methodId);
    if (bank) return { type: 'bank', data: bank };
    const upi = paymentMethods.upiIds.find(u => u.id === methodId);
    if (upi) return { type: 'upi', data: upi };
    const crypto = paymentMethods.cryptoWallets.find(c => c.id === methodId);
    if (crypto) return { type: 'crypto', data: crypto };
    return null;
  };

  const selectedMethod = paymentMethod ? getMethodDetails(paymentMethod) : null;

  // Calculate effective rate with markup
  const effectiveRate = usdInrRate + usdMarkup;

  // Convert USD to INR
  const toInr = (usd) => (usd * effectiveRate).toFixed(2);

  return (
    <div className="wallet-page">
      {/* Currency Rate Display */}
      <div className="currency-rate-bar">
        <span className="rate-label">USD/INR Rate:</span>
        <span className="rate-live">₹{usdInrRate.toFixed(2)} (Live)</span>
        {usdMarkup > 0 && <span className="rate-markup">+ ₹{usdMarkup} markup</span>}
        <span className="rate-effective">= ₹{effectiveRate.toFixed(2)}</span>
      </div>

      {/* Wallet Balance Card */}
      <div className="wallet-balance-card">
        <h2>My Wallet</h2>
        {/* USD Row */}
        <div className="balance-row">
          <span className="currency-label">USD</span>
          <div className="balance-grid">
            <div className="balance-item">
              <span className="balance-label">Balance</span>
              <span className="balance-value">${Number(userWallet.balance || 0).toFixed(2)}</span>
            </div>
            <div className="balance-item">
              <span className="balance-label">Credit</span>
              <span className="balance-value">${Number(userWallet.credit || 0).toFixed(2)}</span>
            </div>
            <div className="balance-item">
              <span className="balance-label">Equity</span>
              <span className="balance-value">${Number(userWallet.equity || 0).toFixed(2)}</span>
            </div>
            <div className="balance-item">
              <span className="balance-label">Margin</span>
              <span className="balance-value">${Number(userWallet.margin || 0).toFixed(2)}</span>
            </div>
            <div className="balance-item highlight">
              <span className="balance-label">Free Margin</span>
              <span className="balance-value">${Number(userWallet.freeMargin || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
        {/* INR Row */}
        <div className="balance-row inr">
          <span className="currency-label">INR</span>
          <div className="balance-grid">
            <div className="balance-item">
              <span className="balance-label">Balance</span>
              <span className="balance-value">₹{toInr(Number(userWallet.balance || 0))}</span>
            </div>
            <div className="balance-item">
              <span className="balance-label">Credit</span>
              <span className="balance-value">₹{toInr(Number(userWallet.credit || 0))}</span>
            </div>
            <div className="balance-item">
              <span className="balance-label">Equity</span>
              <span className="balance-value">₹{toInr(Number(userWallet.equity || 0))}</span>
            </div>
            <div className="balance-item">
              <span className="balance-label">Margin</span>
              <span className="balance-value">₹{toInr(Number(userWallet.margin || 0))}</span>
            </div>
            <div className="balance-item highlight-inr">
              <span className="balance-label">Free Margin</span>
              <span className="balance-value">₹{toInr(Number(userWallet.freeMargin || 0))}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="wallet-content">
        {/* Deposit/Withdrawal Form */}
        <div className="wallet-form-card">
          <div className="wallet-tabs">
            <button
              className={`wallet-tab ${activeTab === 'deposit' ? 'active' : ''}`}
              onClick={() => setActiveTab('deposit')}
            >
              Deposit
            </button>
            <button
              className={`wallet-tab ${activeTab === 'withdrawal' ? 'active' : ''}`}
              onClick={() => setActiveTab('withdrawal')}
            >
              Withdrawal
            </button>
          </div>

          <div className="wallet-form">
            <div className="form-group">
              <label>Amount ($)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                min="1"
              />
            </div>

            <div className="form-group">
              <label>Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">Select payment method</option>
                {paymentMethods.bankAccounts.length > 0 && (
                  <optgroup label="Bank Transfer">
                    {paymentMethods.bankAccounts.map(bank => (
                      <option key={bank.id} value={bank.id}>{bank.bankName} - {bank.accountNumber.slice(-4)}</option>
                    ))}
                  </optgroup>
                )}
                {paymentMethods.upiIds.length > 0 && (
                  <optgroup label="UPI">
                    {paymentMethods.upiIds.map(upi => (
                      <option key={upi.id} value={upi.id}>{upi.name} - {upi.upiId}</option>
                    ))}
                  </optgroup>
                )}
                {paymentMethods.cryptoWallets.length > 0 && (
                  <optgroup label="Crypto">
                    {paymentMethods.cryptoWallets.map(crypto => (
                      <option key={crypto.id} value={crypto.id}>{crypto.network}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Show selected payment details */}
            {selectedMethod && activeTab === 'deposit' && (
              <div className="payment-details-box">
                <h4>Payment Details</h4>
                {selectedMethod.type === 'bank' && (
                  <>
                    <p><strong>Bank:</strong> {selectedMethod.data.bankName}</p>
                    <p><strong>Account:</strong> {selectedMethod.data.accountNumber}</p>
                    <p><strong>IFSC:</strong> {selectedMethod.data.ifsc}</p>
                    <p><strong>Name:</strong> {selectedMethod.data.accountHolder}</p>
                  </>
                )}
                {selectedMethod.type === 'upi' && (
                  <>
                    <p><strong>UPI ID:</strong> {selectedMethod.data.upiId}</p>
                    <p><strong>Name:</strong> {selectedMethod.data.name}</p>
                    {selectedMethod.data.qrImage && (
                      <img src={selectedMethod.data.qrImage} alt="QR" className="payment-qr" />
                    )}
                  </>
                )}
                {selectedMethod.type === 'crypto' && (
                  <>
                    <p><strong>Network:</strong> {selectedMethod.data.network}</p>
                    <p className="crypto-address"><strong>Address:</strong> {selectedMethod.data.address}</p>
                    {selectedMethod.data.qrImage && (
                      <img src={selectedMethod.data.qrImage} alt="QR" className="payment-qr" />
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'deposit' && (
              <div className="form-group">
                <label>Upload Payment Proof *</label>
                <div className="proof-upload-area">
                  <input
                    type="file"
                    id="proof-upload"
                    accept="image/*"
                    onChange={handleProofUpload}
                    className="file-input"
                  />
                  <label htmlFor="proof-upload" className="upload-label">
                    {proofImage ? (
                      <img src={proofImage} alt="Proof" className="proof-preview" />
                    ) : (
                      <div className="upload-placeholder">
                        <span>📷</span>
                        <span>Upload Screenshot</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'withdrawal' && (
              <div className="form-group">
                <label>Withdrawal Details *</label>
                <textarea
                  value={withdrawDetails}
                  onChange={(e) => setWithdrawDetails(e.target.value)}
                  placeholder="Enter your bank account / UPI ID / Crypto wallet address for withdrawal"
                  rows="3"
                />
              </div>
            )}

            <button className="submit-btn" onClick={submitRequest}>
              {activeTab === 'deposit' ? 'Submit Deposit Request' : 'Submit Withdrawal Request'}
            </button>
          </div>
        </div>

        {/* Transaction History */}
        <div className="transactions-card">
          <h3>Transaction History</h3>
          {transactions.length === 0 ? (
            <p className="no-transactions">No transactions yet</p>
          ) : (
            <div className="transactions-list">
              {transactions.slice().reverse().map(tx => (
                <div key={tx.id} className={`transaction-item ${tx.type}`}>
                  <div className="tx-icon">{tx.type === 'deposit' ? '↓' : '↑'}</div>
                  <div className="tx-info">
                    <span className="tx-type">{tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</span>
                    <span className="tx-date">{new Date(tx.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="tx-amount">${Number(tx.amount || 0).toFixed(2)}</div>
                  <span className={`tx-status ${tx.status}`}>{tx.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Home Page Component with Auto-Sliding Banner Carousel
function HomePageContent() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [banners, setBanners] = useState([]);

  useEffect(() => {
    // Fetch active banners from API
    const fetchBanners = async () => {
      try {
        const res = await fetch(`${API_URL}/api/banners/active`);
        const data = await res.json();
        console.log('Banners fetched:', data);
        if (data.banners && data.banners.length > 0) {
          setBanners(data.banners);
        }
      } catch (error) {
        console.error('Error fetching banners:', error);
      }
    };
    fetchBanners();
  }, []);

  // Auto-slide every 4 seconds
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [banners.length]);

  return (
    <div className="home-page">
      {/* Banner Carousel */}
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
                <div
                  key={banner._id}
                  className={`banner-slide ${index === currentSlide ? 'active' : ''}`}
                >
                  <img src={banner.imageData || banner.imageUrl} alt="" />
                </div>
              ))}
            </div>
            {banners.length > 1 && (
              <div className="banner-dots">
                {banners.map((_, index) => (
                  <button
                    key={index}
                    className={`dot ${index === currentSlide ? 'active' : ''}`}
                    onClick={() => setCurrentSlide(index)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>


      {/* TradingView Widgets Section */}
      <div className="home-widgets-section">
        <div className="widget-box">
          <h3 className="widget-title">Market Heatmap</h3>
          <div className="tradingview-widget-container">
            <TradingViewHeatmap />
          </div>
        </div>
        <div className="widget-box">
          <h3 className="widget-title">Quick Actions</h3>
          <div className="quick-wallet-container">
            <QuickWalletActions />
          </div>
        </div>
      </div>

      {/* Market News Section */}
      <div className="home-news-section">
        <h3 className="section-title">Market News & Updates</h3>
        <MarketNews />
      </div>
    </div>
  );
}

// TradingView Heatmap Widget Component
function TradingViewHeatmap() {
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
      "colorTheme": "dark",
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
  }, []);

  return (
    <div className="tradingview-widget-wrapper">
      <div ref={containerRef} className="tradingview-widget" />
      <div className="tradingview-attribution">
        <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">
          Stock Heatmap by TradingView
        </a>
      </div>
    </div>
  );
}

// Quick Wallet Actions Component for Home Page
function QuickWalletActions() {
  const [userWallet, setUserWallet] = useState(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [proofImage, setProofImage] = useState('');
  const [withdrawDetails, setWithdrawDetails] = useState('');
  const [paymentMethods, setPaymentMethods] = useState({ bankAccounts: [], upiIds: [], cryptoWallets: [] });

  useEffect(() => {
    fetchWallet();
    // Load payment methods from admin settings (same as wallet page)
    const raw = JSON.parse(localStorage.getItem('SetupFX-payment-methods') || '{}');
    setPaymentMethods({
      bankAccounts: Array.isArray(raw.bankAccounts) ? raw.bankAccounts : [],
      upiIds: Array.isArray(raw.upiIds) ? raw.upiIds : [],
      cryptoWallets: Array.isArray(raw.cryptoWallets) ? raw.cryptoWallets : []
    });
  }, []);

  const fetchWallet = () => {
    try {
      let balance = 0;
      let credit = 0;

      // Get from SetupFX-auth (logged in user data)
      const authData = JSON.parse(localStorage.getItem('SetupFX-auth') || '{}');
      if (authData.user) {
        balance = authData.user.wallet || 0;
        credit = authData.user.credit || 0;

        // Also check SetupFX-users for admin-updated wallet
        const users = JSON.parse(localStorage.getItem('SetupFX-users') || '[]');
        const localUser = users.find(u => u.id === authData.user.id);
        if (localUser && localUser.wallet !== undefined) {
          balance = localUser.wallet || 0;
          credit = localUser.credit || 0;
        }
      }

      setUserWallet({
        balance: balance,
        credit: credit,
        equity: balance + credit,
        margin: 0,
        freeMargin: balance + credit
      });
    } catch (err) {
      console.error('Error fetching wallet:', err);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProofImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // Get all payment methods as flat array
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
    const userId = localStorage.getItem('userId') || 'demo-user';
    const users = JSON.parse(localStorage.getItem('SetupFX-users') || '[]');
    const currentUser = users.find(u => u.id === userId);

    const newRequest = {
      id: Date.now().toString(),
      userId: userId,
      userName: currentUser?.name || 'User',
      type: 'deposit',
      amount: parseFloat(amount),
      method: paymentMethod,
      methodDetails: selectedMethod?.details,
      proofImage: proofImage,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const requests = JSON.parse(localStorage.getItem('SetupFX-fund-requests') || '[]');
    requests.push(newRequest);
    localStorage.setItem('SetupFX-fund-requests', JSON.stringify(requests));

    alert('Deposit request submitted successfully!');
    setShowDepositModal(false);
    setAmount('');
    setPaymentMethod('');
    setProofImage('');
    fetchWallet();
  };

  const submitWithdraw = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!paymentMethod) {
      alert('Please select a payment method');
      return;
    }
    if (!withdrawDetails) {
      alert('Please enter withdrawal details');
      return;
    }
    if (userWallet && parseFloat(amount) > userWallet.freeMargin) {
      alert('Insufficient balance');
      return;
    }

    const selectedMethod = getSelectedMethod();
    const userId = localStorage.getItem('userId') || 'demo-user';
    const users = JSON.parse(localStorage.getItem('SetupFX-users') || '[]');
    const currentUser = users.find(u => u.id === userId);

    const newRequest = {
      id: Date.now().toString(),
      userId: userId,
      userName: currentUser?.name || 'User',
      type: 'withdrawal',
      amount: parseFloat(amount),
      method: paymentMethod,
      methodDetails: selectedMethod?.details,
      withdrawDetails: withdrawDetails,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const requests = JSON.parse(localStorage.getItem('SetupFX-fund-requests') || '[]');
    requests.push(newRequest);
    localStorage.setItem('SetupFX-fund-requests', JSON.stringify(requests));

    alert('Withdrawal request submitted successfully!');
    setShowWithdrawModal(false);
    setAmount('');
    setPaymentMethod('');
    setWithdrawDetails('');
    fetchWallet();
  };

  return (
    <div className="quick-wallet">
      {/* Balance Display */}
      <div className="quick-balance-card">
        <div className="balance-row">
          <span className="balance-label">Balance</span>
          <span className="balance-value">${Number(userWallet?.balance || 0).toFixed(2)}</span>
        </div>
        <div className="balance-row">
          <span className="balance-label">Free Margin</span>
          <span className="balance-value">${Number(userWallet?.freeMargin || 0).toFixed(2)}</span>
        </div>
        <div className="balance-row">
          <span className="balance-label">Equity</span>
          <span className="balance-value">${Number(userWallet?.equity || 0).toFixed(2)}</span>
        </div>
      </div>

      {/* Quick Action Buttons */}
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

      {/* Deposit Modal */}
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
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  min="0"
                />
              </div>
              <div className="form-group">
                <label>Select Payment Method</label>
                {getAllPaymentMethods().length === 0 ? (
                  <p className="no-methods">No payment methods available. Contact admin.</p>
                ) : (
                  <div className="payment-methods-list">
                    {getAllPaymentMethods().map(m => (
                      <button
                        key={m.id}
                        className={`payment-method-item ${paymentMethod === m.id ? 'selected' : ''}`}
                        onClick={() => setPaymentMethod(m.id)}
                      >
                        <span className="method-icon">{m.icon}</span>
                        <span className="method-name">{m.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Show payment details when method selected */}
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

      {/* Withdraw Modal */}
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
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  min="0"
                  max={userWallet?.freeMargin || 0}
                />
              </div>
              <div className="form-group">
                <label>Select Withdrawal Method</label>
                {getAllPaymentMethods().length === 0 ? (
                  <p className="no-methods">No payment methods available. Contact admin.</p>
                ) : (
                  <div className="payment-methods-list">
                    {getAllPaymentMethods().map(m => (
                      <button
                        key={m.id}
                        className={`payment-method-item ${paymentMethod === m.id ? 'selected' : ''}`}
                        onClick={() => setPaymentMethod(m.id)}
                      >
                        <span className="method-icon">{m.icon}</span>
                        <span className="method-name">{m.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Your {getSelectedMethod()?.type === 'bank' ? 'Bank Account' : getSelectedMethod()?.type === 'upi' ? 'UPI ID' : 'Wallet Address'} Details</label>
                <textarea
                  value={withdrawDetails}
                  onChange={(e) => setWithdrawDetails(e.target.value)}
                  placeholder="Enter your bank account / UPI ID / Crypto wallet address for receiving funds"
                  rows="3"
                />
              </div>
              <button className="submit-btn" onClick={submitWithdraw}>Submit Withdrawal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Market News Component with images and YouTube previews
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
      // Using free Finnhub API for market news
      const response = await fetch('https://finnhub.io/api/v1/news?category=general&token=demo');
      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        setNews(data.slice(0, 12));
      } else {
        // Fallback sample news if API fails
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
    {
      id: 1,
      headline: 'Gold Prices Surge Amid Global Uncertainty',
      summary: 'Gold prices reached new highs as investors seek safe-haven assets amid ongoing geopolitical tensions.',
      image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=400',
      source: 'Market Watch',
      datetime: Date.now() / 1000 - 3600,
      url: '#',
      category: 'commodities'
    },
    {
      id: 2,
      headline: 'Fed Signals Potential Rate Cuts in 2026',
      summary: 'Federal Reserve officials hint at possible interest rate reductions later this year.',
      image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400',
      source: 'Reuters',
      datetime: Date.now() / 1000 - 7200,
      url: '#',
      category: 'forex'
    },
    {
      id: 3,
      headline: 'Bitcoin Breaks $100K Resistance Level',
      summary: 'Cryptocurrency markets rally as Bitcoin surpasses key psychological barrier.',
      image: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=400',
      source: 'CoinDesk',
      datetime: Date.now() / 1000 - 10800,
      url: '#',
      category: 'crypto'
    },
    {
      id: 4,
      headline: 'Tech Stocks Lead Market Rally',
      summary: 'Major technology companies drive gains in US equity markets.',
      image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400',
      source: 'Bloomberg',
      datetime: Date.now() / 1000 - 14400,
      url: '#',
      category: 'stocks'
    },
    {
      id: 5,
      headline: 'EUR/USD Volatility Increases on ECB Decision',
      summary: 'European Central Bank policy announcement sparks currency market movements.',
      image: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400',
      source: 'FX Street',
      datetime: Date.now() / 1000 - 18000,
      url: '#',
      category: 'forex'
    },
    {
      id: 6,
      headline: 'Oil Prices Stabilize After OPEC Meeting',
      summary: 'Crude oil markets find balance following production quota discussions.',
      image: 'https://images.unsplash.com/photo-1513828583688-c52646db42da?w=400',
      source: 'Energy News',
      datetime: Date.now() / 1000 - 21600,
      url: '#',
      category: 'commodities'
    }
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

  const filteredNews = activeCategory === 'all'
    ? news
    : news.filter(item => item.category === activeCategory);

  return (
    <div className="market-news">
      <div className="news-categories">
        {categories.map(cat => (
          <button
            key={cat}
            className={`category-btn ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="news-loading">Loading market news...</div>
      ) : (
        <div className="news-grid">
          {filteredNews.map((item, index) => (
            <a
              key={item.id || index}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="news-card"
            >
              <div className="news-image">
                <img
                  src={item.image || 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400'}
                  alt={item.headline}
                  onError={(e) => e.target.src = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400'}
                />
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

      {/* YouTube Trading Videos Section */}
      <div className="youtube-section">
        <h4 className="youtube-title">📚 Trading Education</h4>

        {/* Trading Basics */}
        <div className="video-category">
          <h5 className="category-title">🎯 Trading Basics</h5>
          <div className="youtube-grid">
            <div className="youtube-card">
              <iframe
                src="https://www.youtube.com/embed/p7HKvqRI_Bo"
                title="Stock Market Explained"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <div className="video-info">
                <span className="video-title">Stock Market Explained (Whiteboard)</span>
              </div>
            </div>
            <div className="youtube-card">
              <iframe
                src="https://www.youtube.com/embed/ZCFkWDdmXG8"
                title="Investing For Beginners"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <div className="video-info">
                <span className="video-title">Investing For Beginners (Graham Stephan)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Crypto */}
        <div className="video-category">
          <h5 className="category-title">₿ Cryptocurrency</h5>
          <div className="youtube-grid">
            <div className="youtube-card">
              <iframe
                src="https://www.youtube.com/embed/bBC-nXj3Ng4"
                title="How Bitcoin Works"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <div className="video-info">
                <span className="video-title">But How Does Bitcoin Actually Work? (3Blue1Brown)</span>
              </div>
            </div>
            <div className="youtube-card">
              <iframe
                src="https://www.youtube.com/embed/Yb6825iv0Vk"
                title="Crypto Explained"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <div className="video-info">
                <span className="video-title">Cryptocurrency Explained (Simply Explained)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Analysis */}
        <div className="video-category">
          <h5 className="category-title">📊 Technical Analysis</h5>
          <div className="youtube-grid">
            <div className="youtube-card">
              <iframe
                src="https://www.youtube.com/embed/08R_TJhAOGo"
                title="Technical Analysis"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <div className="video-info">
                <span className="video-title">The Only Technical Analysis Video You Need</span>
              </div>
            </div>
            <div className="youtube-card">
              <iframe
                src="https://www.youtube.com/embed/MN3-HJ-pPrg"
                title="EMA Strategy"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <div className="video-info">
                <span className="video-title">The FASTEST & Most AGGRESSIVE EMA Strategy</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App({ user, onLogout }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('SetupFX-dark-mode');
    const dark = saved === null ? true : saved === 'true';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    return dark;
  });
  const [activePage, setActivePage] = useState(() => {
    return localStorage.getItem('SetupFX-active-page') || 'market';
  }); // home, market, orders, wallet, business, masters, settings

  // KYC State
  const [kycStatus, setKycStatus] = useState({ status: 'not_submitted', kyc: null });
  const [kycForm, setKycForm] = useState({
    documentType: 'aadhaar',
    documentNumber: '',
    fullName: '',
    dateOfBirth: '',
    address: '',
    frontImage: '',
    backImage: '',
    selfieImage: ''
  });
  const [kycSubmitting, setKycSubmitting] = useState(false);

  // Save active page to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('SetupFX-active-page', activePage);
  }, [activePage]);
  const [selectedSymbol, setSelectedSymbol] = useState('XAUUSD');
  const [chartTabs, setChartTabs] = useState(['XAUUSD']);
  const [activeTab, setActiveTab] = useState('positions');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('FAVORITES');
  const [instrumentsPanelCollapsed, setInstrumentsPanelCollapsed] = useState(false);
  const [expandedSegments, setExpandedSegments] = useState({});
  // Default major trading pairs
  const DEFAULT_WATCHLIST = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD', 'US100', 'US30'];

  // Load watchlist from localStorage or use defaults
  const [watchlist, setWatchlist] = useState(() => {
    const saved = localStorage.getItem('SetupFX-watchlist');
    let list = DEFAULT_WATCHLIST;
    if (saved) {
      try {
        list = JSON.parse(saved);
      } catch {
        list = DEFAULT_WATCHLIST;
      }
    }
    return mergeWatchlistBrokerVariants(list);
  });
  const [oneClickMode, setOneClickMode] = useState(false);
  const [oneClickLotSize, setOneClickLotSize] = useState('0.01');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [hoveredInstrument, setHoveredInstrument] = useState(null);
  
  // Get user's allowed trade modes - fetch from server if not in user object
  const [allowedTradeModes, setAllowedTradeModes] = useState({ hedging: true, netting: true, binary: true });
  const [tradingMode, setTradingMode] = useState('hedging');
  
  // Fetch user's allowed trade modes from server
  useEffect(() => {
    const fetchAllowedTradeModes = async () => {
      if (!user?.id && !user?.oderId) return;
      try {
        const userId = user.oderId || user.id;
        console.log('[TradeModes] Fetching for user:', userId);
        const res = await fetch(`${API_URL}/api/admin/users/${userId}`);
        const data = await res.json();
        console.log('[TradeModes] API Response:', data);
        if (data.success && data.user) {
          const modes = data.user.allowedTradeModes || { hedging: true, netting: true, binary: true };
          console.log('[TradeModes] Setting modes:', modes);
          setAllowedTradeModes(modes);
          // Set trading mode to first allowed mode if current is not allowed
          if (!modes[tradingMode]) {
            if (modes.hedging) setTradingMode('hedging');
            else if (modes.netting) setTradingMode('netting');
            else if (modes.binary) setTradingMode('binary');
          }
        }
      } catch (error) {
        console.error('Error fetching trade modes:', error);
      }
    };
    fetchAllowedTradeModes();
  }, [user?.id, user?.oderId]);
  const [usdInrRate, setUsdInrRate] = useState(83);
  const [usdMarkup, setUsdMarkup] = useState(0);
  const [displayCurrency, setDisplayCurrency] = useState(() => {
    return localStorage.getItem('SetupFX-display-currency') || 'INR';
  }); // USD or INR

  // Save currency preference when changed
  const handleCurrencyChange = (currency) => {
    setDisplayCurrency(currency);
    localStorage.setItem('SetupFX-display-currency', currency);
  };

  const [appBinarySettings, setAppBinarySettings] = useState({
    minTradeAmount: 100,
    maxTradeAmount: 1000000,
    payoutPercent: 85,
    allowedExpiries: [60, 120, 300, 600, 900, 1800, 3600]
  });

  useEffect(() => {
    fetch(`${API_URL}/api/settings/trade-modes`)
      .then((r) => r.json())
      .then((data) => {
        const b = data?.binary;
        if (!b) return;
        let expiries = b.expiryOptions || b.allowedExpiries;
        if (typeof expiries === 'string') {
          expiries = expiries.split(',').map((e) => parseInt(e.trim(), 10)).filter((e) => !Number.isNaN(e));
        }
        setAppBinarySettings({
          minTradeAmount: typeof b.minTradeAmount === 'number' ? b.minTradeAmount : 100,
          maxTradeAmount: typeof b.maxTradeAmount === 'number' ? b.maxTradeAmount : 1000000,
          payoutPercent: b.payoutPercent ?? 85,
          allowedExpiries:
            Array.isArray(expiries) && expiries.length > 0 ? expiries : [60, 300, 900, 3600]
        });
      })
      .catch(() => {});
  }, []);

  const appBinaryStakeMeta = useMemo(() => {
    const rate = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);
    const rawMin = Number(appBinarySettings?.minTradeAmount);
    const rawMax = Number(appBinarySettings?.maxTradeAmount);
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
  }, [usdInrRate, usdMarkup, appBinarySettings.minTradeAmount, appBinarySettings.maxTradeAmount, displayCurrency]);

  const clampAppBinaryStake = useCallback(
    (v) => {
      const x = Math.min(appBinaryStakeMeta.maxDisp, Math.max(appBinaryStakeMeta.minDisp, v));
      if (displayCurrency === 'INR') return Math.round(x);
      return Math.round(x * 10000) / 10000;
    },
    [appBinaryStakeMeta, displayCurrency]
  );

  const formatPrice = (price, symbol, convertToInr = false) => {
    if (!price) return '-';
    const displayPrice = convertToInr && displayCurrency === 'INR'
      ? price * (usdInrRate + usdMarkup)
      : price;
    const prefix = convertToInr && displayCurrency === 'INR' ? '₹' : '';
    if (symbol?.includes('JPY')) return prefix + displayPrice.toFixed(2);
    if (symbol?.includes('BTC') || symbol?.includes('XAU')) return prefix + displayPrice.toFixed(2);
    return prefix + (convertToInr && displayCurrency === 'INR' ? displayPrice.toFixed(2) : displayPrice.toFixed(4));
  };

  // Netting mode specific state
  const [orderSession, setOrderSession] = useState('intraday'); // intraday, carryforward

  // Binary mode specific state
  const [binaryDirection, setBinaryDirection] = useState('up'); // up, down
  const [binaryAmount, setBinaryAmount] = useState(100);
  const [binaryExpiry, setBinaryExpiry] = useState(300); // seconds

  useEffect(() => {
    const { minInr, maxInr, rate } = appBinaryStakeMeta;
    if (!Number.isFinite(minInr) || minInr <= 0 || !Number.isFinite(maxInr) || maxInr < minInr) return;
    setBinaryAmount((prev) => {
      const stakeInr = displayCurrency === 'INR' ? prev : prev * rate;
      const clampedInr = Math.min(maxInr, Math.max(minInr, stakeInr));
      if (displayCurrency === 'INR') return Math.round(clampedInr);
      return Math.round((clampedInr / rate) * 10000) / 10000;
    });
  }, [
    appBinaryStakeMeta.minInr,
    appBinaryStakeMeta.maxInr,
    appBinaryStakeMeta.rate,
    displayCurrency
  ]);

  // Positions state
  const [positions, setPositions] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [cancelledOrders, setCancelledOrders] = useState([]);
  const [totalPnL, setTotalPnL] = useState(0);

  // Orders page state
  const [ordersActiveTab, setOrdersActiveTab] = useState('open');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');

  // Filter orders by date range
  const filterOrdersByDate = (orders) => {
    if (!orderDateFrom && !orderDateTo) return orders;

    return orders.filter(order => {
      const orderDate = new Date(order.openTime || order.createdAt || order.closeTime);
      const fromDate = orderDateFrom ? new Date(orderDateFrom) : null;
      const toDate = orderDateTo ? new Date(orderDateTo + 'T23:59:59') : null;

      if (fromDate && orderDate < fromDate) return false;
      if (toDate && orderDate > toDate) return false;
      return true;
    });
  };

  // Toast notifications state
  const [notifications, setNotifications] = useState([]);

  // Show toast notification
  const showNotification = (message, type = 'info', duration = 4000) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  };

  // Wallet state from backend
  const [walletData, setWalletData] = useState({
    balance: 0,
    credit: 0,
    equity: 0,
    margin: 0,
    freeMargin: 0,
    marginLevel: 0
  });

  // Modal states for position management
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [editSL, setEditSL] = useState('');
  const [editTP, setEditTP] = useState('');
  const [closeVolume, setCloseVolume] = useState('');

  // MetaAPI real-time prices and order execution
  const { prices: livePrices, isConnected: isMetaApiConnected, executeOrder, oneClickPending } =
    useMetaApiPrices();
  
  // Zerodha prices (for Indian markets)
  const { getTickBySymbolAuto } = useZerodhaTicks();

  // Fetch live USD/INR rate and load admin markup
  useEffect(() => {
    const currencySettings = JSON.parse(localStorage.getItem('SetupFX-currency-settings') || '{"usdMarkup":0}');
    setUsdMarkup(currencySettings.usdMarkup || 0);

    const fetchUsdRate = async () => {
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data.rates && data.rates.INR) {
          setUsdInrRate(data.rates.INR);
        }
      } catch (error) {
        console.log('Using fallback USD rate');
      }
    };
    fetchUsdRate();
    const interval = setInterval(fetchUsdRate, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch KYC status
  const fetchKycStatus = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_URL}/api/kyc/status/${user.id}`);
      const data = await res.json();
      if (data.success) {
        setKycStatus({ status: data.status, kyc: data.kyc });
        if (data.kyc) {
          setKycForm(prev => ({
            ...prev,
            fullName: data.kyc.fullName || user?.name || '',
            documentType: data.kyc.documentType || 'aadhaar'
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching KYC status:', error);
    }
  };

  useEffect(() => {
    if (user?.id && activePage === 'settings') {
      fetchKycStatus();
    }
  }, [user?.id, activePage]);

  // Handle KYC image upload
  const handleKycImageUpload = (field) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setKycForm(prev => ({ ...prev, [field]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  // Submit KYC
  const submitKyc = async (e) => {
    e.preventDefault();
    if (!kycForm.documentNumber || !kycForm.fullName || !kycForm.frontImage) {
      alert('Please fill all required fields and upload front image');
      return;
    }
    setKycSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/kyc/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id || user.id,
          oderId: user.oderId || user.id,
          ...kycForm
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('KYC submitted successfully! It will be reviewed shortly.');
        fetchKycStatus();
      } else {
        alert(data.error || 'Failed to submit KYC');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setKycSubmitting(false);
    }
  };

  // Store last known good wallet data
  const lastGoodWalletRef = useRef(null);

  // Fetch wallet from server API
  const fetchWallet = async () => {
    try {
      if (!user?.id) return;

      // Fetch wallet from server
      const response = await fetch(`${API_URL}/api/wallet/${user.id}`);
      if (!response.ok) {
        // On failure, use last known good data
        if (lastGoodWalletRef.current) {
          setWalletData(lastGoodWalletRef.current);
        }
        return;
      }

      const data = await response.json();

      // Validate that we got actual wallet data
      if (!data.wallet || data.wallet.balance === undefined) {
        if (lastGoodWalletRef.current) {
          setWalletData(lastGoodWalletRef.current);
        }
        return;
      }

      const balance = Number(data.wallet.balance) || 0;
      const credit = Number(data.wallet.credit) || 0;

      // Get margin from server (stored when positions are opened)
      const serverMargin = Number(data.wallet.margin) || 0;

      // Calculate real-time P/L from open positions
      let totalPnL = 0;
      let totalMargin = serverMargin; // Start with server margin

      // Only calculate P/L if we have both positions and live prices
      if (positions.length > 0 && Object.keys(livePrices).length > 0) {
        totalMargin = 0; // Recalculate from positions

        positions.forEach(pos => {
          if (pos.status === 'closed') return;

          const livePrice = livePrices[pos.symbol];
          const vol = pos.volume || pos.quantity || 0;
          const symbol = pos.symbol || '';

          // Add position margin
          totalMargin += pos.marginUsed || pos.margin || 0;

          // Skip P/L calculation if no live price
          if (!livePrice) return;

          const currentPrice = pos.side === 'buy' ? livePrice.bid : livePrice.ask;
          const entryPrice = pos.entryPrice || pos.avgPrice || 0;
          const priceDiff = pos.side === 'buy'
            ? currentPrice - entryPrice
            : entryPrice - currentPrice;

          // Get contract size
          let contractSize = 100000; // Default forex
          if (symbol.includes('BTC') || symbol.includes('ETH')) {
            contractSize = 1;
          } else if (symbol.includes('ADA')) {
            contractSize = 1000;
          } else if (symbol === 'XAUUSD' || symbol === 'XPTUSD') {
            contractSize = 100;
          } else if (symbol === 'XAGUSD') {
            contractSize = 5000;
          } else if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') {
            contractSize = 1;
          } else if (symbol === 'BRENT' || symbol.includes('OIL')) {
            contractSize = 1000;
          }

          // Calculate P/L
          let pnl;
          if (symbol.includes('JPY')) {
            pnl = (priceDiff * 100000 * vol) / 100;
          } else {
            pnl = priceDiff * contractSize * vol;
          }

          totalPnL += pnl;
        });
      }

      const equity = balance + credit + totalPnL;
      const freeMargin = equity - totalMargin;
      const marginLevel = totalMargin > 0 ? (equity / totalMargin) * 100 : 0;

      const newWalletData = {
        balance,
        credit,
        equity,
        margin: totalMargin,
        freeMargin,
        marginLevel
      };

      // Only update if balance is valid (not suddenly zero when it was positive)
      setWalletData(prev => {
        // If server returns 0 balance but we had a positive balance, keep previous
        if (balance === 0 && prev.balance > 0) {
          return prev;
        }
        // Store as last known good data
        lastGoodWalletRef.current = newWalletData;
        return newWalletData;
      });
    } catch (error) {
      // On error, use last known good data
      if (lastGoodWalletRef.current) {
        setWalletData(lastGoodWalletRef.current);
      }
    }
  };

  // Fetch positions from backend (all modes)
  const fetchPositions = async () => {
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/positions/all/${userId}`);
      const data = await response.json();
      if (data.positions) {
        // Filter only open/active positions (not pending or closed)
        const openPositions = data.positions.filter(p =>
          p.status === 'open' || p.status === 'active' || !p.status
        );
        setPositions(openPositions);
        const total = openPositions.reduce((sum, p) => sum + (p.profit || 0), 0);
        setTotalPnL(total);
      }
    } catch (error) {
      console.log('Server not running, using local positions');
    }
  };

  // Fetch pending orders
  const fetchPendingOrders = async () => {
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/orders/pending/${userId}`);
      const data = await response.json();
      if (data.orders) {
        setPendingOrders(data.orders);
      }
    } catch (error) {
      console.log('Error fetching pending orders');
    }
  };

  // Fetch trade history
  const fetchTradeHistory = async () => {
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/trades/${userId}`);
      const data = await response.json();
      if (data.trades) {
        setTradeHistory(data.trades);
      }
    } catch (error) {
      console.log('Error fetching trade history');
    }
  };

  // Fetch cancelled orders
  const fetchCancelledOrders = async () => {
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/orders/cancelled/${userId}`);
      const data = await response.json();
      if (data.orders) {
        setCancelledOrders(data.orders);
      }
    } catch (error) {
      console.log('Error fetching cancelled orders');
    }
  };

  // Timer tick for binary countdown (forces re-render every second)
  const [timerTick, setTimerTick] = useState(0);

  // Track previous binary positions to detect completions
  const prevBinaryPositionsRef = useRef([]);
  const isInitialLoadRef = useRef(true);

  // Check for completed binary trades and show notifications
  const checkBinaryCompletions = async () => {
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/trades/${userId}`);
      const data = await response.json();
      if (data.trades) {
        const completedBinaryIds = data.trades
          .filter(t => t.mode === 'binary' && t.result)
          .map(t => t.tradeId);

        // On initial load, just populate the ref without showing notifications
        if (isInitialLoadRef.current) {
          prevBinaryPositionsRef.current = completedBinaryIds;
          isInitialLoadRef.current = false;
          setTradeHistory(data.trades);
          return;
        }

        const prevIds = prevBinaryPositionsRef.current;
        const newCompletedBinary = data.trades.filter(t =>
          t.mode === 'binary' &&
          t.result &&
          !prevIds.includes(t.tradeId)
        );

        newCompletedBinary.forEach(trade => {
          const isWin = trade.result === 'win';
          const profit = trade.profit || 0;
          showNotification(
            `Binary ${trade.symbol} ${trade.result.toUpperCase()}! P/L: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`,
            isWin ? 'success' : 'error',
            6000
          );
        });

        // Update tracked IDs
        prevBinaryPositionsRef.current = completedBinaryIds;

        setTradeHistory(data.trades);
      }
    } catch (error) {
      console.log('Error checking binary completions');
    }
  };

  // Fetch positions and wallet on load and periodically
  useEffect(() => {
    fetchPositions();
    fetchPendingOrders();
    fetchTradeHistory();
    fetchCancelledOrders();
    fetchWallet();
    const posInterval = setInterval(fetchPositions, 5000); // Refresh positions every 5s
    const pendingInterval = setInterval(fetchPendingOrders, 5000);
    const binaryCheckInterval = setInterval(checkBinaryCompletions, 3000); // Check binary completions
    const walletInterval = setInterval(fetchWallet, 3000); // Refresh wallet every 3s (reduced from 2s to prevent fluctuation)
    // Timer tick for binary countdown display
    const timerInterval = setInterval(() => setTimerTick(t => t + 1), 1000);
    return () => {
      clearInterval(posInterval);
      clearInterval(pendingInterval);
      clearInterval(binaryCheckInterval);
      clearInterval(walletInterval);
      clearInterval(timerInterval);
    };
  }, [user]);

  // Update wallet P/L in real-time when live prices change (without refetching from server)
  useEffect(() => {
    if (positions.length === 0 || Object.keys(livePrices).length === 0) return;

    // Calculate P/L locally without fetching from server to prevent fluctuation
    setWalletData(prev => {
      if (!prev.balance && prev.balance !== 0) return prev; // No valid previous data

      let totalPnL = 0;
      let totalMargin = 0;

      positions.forEach(pos => {
        if (pos.status === 'closed') return;

        const livePrice = livePrices[pos.symbol];
        const vol = pos.volume || pos.quantity || 0;
        const symbol = pos.symbol || '';

        totalMargin += pos.marginUsed || pos.margin || 0;

        if (!livePrice) return;

        const currentPrice = pos.side === 'buy' ? livePrice.bid : livePrice.ask;
        const entryPrice = pos.entryPrice || pos.avgPrice || 0;
        const priceDiff = pos.side === 'buy'
          ? currentPrice - entryPrice
          : entryPrice - currentPrice;

        let contractSize = 100000;
        if (symbol.includes('BTC') || symbol.includes('ETH')) contractSize = 1;
        else if (symbol.includes('ADA')) contractSize = 1000;
        else if (symbol === 'XAUUSD' || symbol === 'XPTUSD') contractSize = 100;
        else if (symbol === 'XAGUSD') contractSize = 5000;
        else if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') contractSize = 1;
        else if (symbol === 'BRENT' || symbol.includes('OIL')) contractSize = 1000;

        const pnl = symbol.includes('JPY')
          ? (priceDiff * 100000 * vol) / 100
          : priceDiff * contractSize * vol;

        totalPnL += pnl;
      });

      const equity = prev.balance + prev.credit + totalPnL;
      const freeMargin = equity - totalMargin;
      const marginLevel = totalMargin > 0 ? (equity / totalMargin) * 100 : 0;

      return {
        ...prev,
        equity,
        margin: totalMargin,
        freeMargin,
        marginLevel
      };
    });
  }, [livePrices, positions]);

  // Handle position close
  const handleClosePosition = async (position, volumeToClose = null) => {
    try {
      const userId = user?.id || 'guest';
      
      // Check MetaAPI prices first (Forex/Crypto)
      let livePrice = livePrices[position.symbol];
      let hasLivePrice = livePrice && (livePrice.bid > 0 || livePrice.ask > 0);
      
      // If no MetaAPI price, check Zerodha ticks (Indian instruments)
      if (!hasLivePrice && getTickBySymbolAuto) {
        const zerodhaTick = getTickBySymbolAuto(position.symbol);
        const zLp = zerodhaTick?.lastPrice || zerodhaTick?.last_price || 0;
        if (zerodhaTick && zLp > 0) {
          livePrice = {
            bid: zerodhaTick.bid || zLp,
            ask: zerodhaTick.ask || zLp
          };
          hasLivePrice = true;
        }
      }

      // Fallback to position's current price if available
      if (!hasLivePrice && position.currentPrice && position.currentPrice > 0) {
        livePrice = {
          bid: position.currentPrice,
          ask: position.currentPrice
        };
        hasLivePrice = true;
      }
      
      // Last fallback - use entry price (for demo/testing purposes)
      if (!hasLivePrice && position.entryPrice && position.entryPrice > 0) {
        livePrice = {
          bid: position.entryPrice,
          ask: position.entryPrice
        };
        hasLivePrice = true;
        console.warn(`[ClosePosition] Using entry price as fallback for ${position.symbol}`);
      }

      // Check if market is open for closing
      if (!hasLivePrice) {
        showNotification('Market closed. Cannot close without live price.', 'error');
        return;
      }

      const currentPrice = position.side === 'buy' ? livePrice.bid : livePrice.ask;

      const response = await fetch(`${API_URL}/api/positions/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: position.mode || tradingMode,
          userId,
          positionId: position.oderId || position.tradeId,
          symbol: position.symbol,
          volume: volumeToClose || position.volume || position.quantity,
          currentPrice
        })
      });

      const result = await response.json();
      if (result.success) {
        // Update wallet if returned
        if (result.wallet) {
          setWalletData(result.wallet);
        }
        const profit = result.profit || 0;
        showNotification(`Position closed! P/L: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`, profit >= 0 ? 'success' : 'error');
        fetchPositions();
        fetchTradeHistory();
        fetchWallet();
        setShowCloseModal(false);
      } else {
        showNotification(`Close failed: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  };

  // Handle position modify (SL/TP)
  const handleModifyPosition = async () => {
    if (!selectedPosition) return;
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/positions/modify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: selectedPosition.mode || tradingMode,
          userId,
          positionId: selectedPosition.oderId || selectedPosition.tradeId,
          stopLoss: editSL ? parseFloat(editSL) : null,
          takeProfit: editTP ? parseFloat(editTP) : null
        })
      });

      const result = await response.json();
      if (result.success) {
        showNotification('Position modified successfully!', 'success');
        fetchPositions();
        setShowEditModal(false);
      } else {
        showNotification(`Modify failed: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  };

  // Open edit modal
  const openEditModal = (position) => {
    setSelectedPosition(position);
    setEditSL(position.stopLoss || '');
    setEditTP(position.takeProfit || '');
    setShowEditModal(true);
  };

  // Open close modal for partial close
  const openCloseModal = (position) => {
    setSelectedPosition(position);
    setCloseVolume(position.volume || position.quantity || '');
    setShowCloseModal(true);
  };

  // Handle Buy/Sell order execution (netting UI → netting engine; hedging UI → hedging; binary UI → treat as netting for one-click)
  const handleExecuteOrder = async (symbol, side) => {
    if (!oneClickMode) return;

    const effectiveMode = tradingMode === 'hedging' ? 'hedging' : 'netting';
    const result = await executeOrder(symbol, side, oneClickLotSize, {
      mode: effectiveMode,
      session: orderSession,
      leverage
    });
    if (result.success) {
      console.log(`${side.toUpperCase()} order executed for ${symbol}:`, result.data);
      showNotification(`${side.toUpperCase()} ${oneClickLotSize} lots ${symbol}`, 'success');
      fetchPositions();
    } else {
      console.error('Order failed:', result.error);
      showNotification(`Order failed: ${result.error}`, 'error');
    }
  };

  // Helper function to get instrument with live prices merged (no mock data fallback)
  const getInstrumentWithLivePrice = (inst) => {
    const livePrice = livePrices[inst.symbol];
    if (livePrice) {
      return {
        ...inst,
        bid: livePrice.bid || 0,
        ask: livePrice.ask || 0,
        low: livePrice.low || 0,
        high: livePrice.high || 0,
        change: livePrice.change !== undefined ? livePrice.change : 0,
        pips: livePrice.pips !== undefined ? livePrice.pips : 0,
      };
    }
    // No live price - return with zeros instead of mock data
    return { ...inst, bid: 0, ask: 0, low: 0, high: 0, change: 0, pips: 0 };
  };

  // Save watchlist to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('SetupFX-watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  // Add instrument to chart tabs
  const addChartTab = (symbol) => {
    if (!chartTabs.includes(symbol)) {
      setChartTabs(prev => [...prev, symbol]);
    }
    setSelectedSymbol(symbol);
  };

  // Remove chart tab
  const removeChartTab = (symbol, e) => {
    e.stopPropagation();
    if (chartTabs.length > 1) {
      const newTabs = chartTabs.filter(s => s !== symbol);
      setChartTabs(newTabs);
      if (selectedSymbol === symbol) {
        setSelectedSymbol(newTabs[newTabs.length - 1]);
      }
    }
  };

  // Toggle segment expansion
  const toggleSegment = (segment) => {
    setExpandedSegments(prev => ({
      ...prev,
      [segment]: !prev[segment]
    }));
  };

  // Add/remove from watchlist (one row per broker underlying, e.g. XAUUSD vs XAUUSD.c)
  const toggleWatchlist = (symbol, e) => {
    e.stopPropagation();
    setWatchlist(prev => {
      const base = stripBrokerInstrumentSuffix(symbol);
      const inList = prev.some(s => stripBrokerInstrumentSuffix(s) === base);
      if (inList) {
        return prev.filter(s => stripBrokerInstrumentSuffix(s) !== base);
      }
      const canonical = canonicalBrokerSymbolForBase([symbol], base) || symbol;
      return [...prev.filter(s => stripBrokerInstrumentSuffix(s) !== base), canonical];
    });
  };

  // Order Engine State
  const [orderSide, setOrderSide] = useState('buy'); // 'buy' or 'sell'
  const [orderType, setOrderType] = useState('market'); // 'market', 'limit', 'stop'
  const [volume, setVolume] = useState(0.01);
  const [marginPercent, setMarginPercent] = useState(25);
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [slPips, setSlPips] = useState(50);
  const [tpPips, setTpPips] = useState(100);

  // Get selected instrument with live prices merged
  const staticSelectedInstrument = allInstruments.find(i => i.symbol === selectedSymbol) || allInstruments[0];
  const selectedInstrument = getInstrumentWithLivePrice(staticSelectedInstrument);

  // Calculate pip value based on instrument
  const getPipValue = (symbol) => {
    if (symbol.includes('JPY')) return 0.01;
    if (symbol === 'XAUUSD' || symbol === 'XPTUSD') return 0.1;
    if (symbol === 'BTCUSD') return 1;
    if (symbol === 'US100' || symbol === 'US2000') return 0.1;
    return 0.0001;
  };

  const pipValue = getPipValue(selectedSymbol);
  const entryPrice = orderSide === 'buy' ? selectedInstrument.ask : selectedInstrument.bid;

  // Calculate margin required (safely parse volume) - MT5 Standard Formula
  const volumeNum = parseFloat(volume) || 0.01;
  const getContractSize = (symbol) => {
    if (symbol.includes('BTC')) return 1;
    if (symbol.includes('ETH')) return 1;
    if (symbol.includes('ADA')) return 1000;
    if (symbol === 'XAUUSD') return 100;
    if (symbol === 'XAGUSD') return 5000;
    if (symbol === 'XPTUSD') return 100;
    if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') return 1;
    if (symbol === 'BRENT' || symbol.includes('OIL')) return 1000;
    return 100000; // Standard forex
  };
  const contractSize = getContractSize(selectedSymbol);
  const marginRequired = (volumeNum * contractSize * entryPrice) / leverage;

  // Calculate SL/TP prices from pips
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

  // Check if market is open (has live price data)
  const isMarketOpen = (symbol) => {
    const livePrice = livePrices[symbol];
    return livePrice && (livePrice.bid > 0 || livePrice.ask > 0);
  };

  // Check if market is open based on symbol type and current time
  const checkMarketHours = (symbol) => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getUTCHours();

    // Crypto markets are always open (24/7)
    if (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('ADA') ||
      symbol.includes('SOL') || symbol.includes('XRP') || symbol.includes('DOGE') ||
      selectedInstrument?.category?.toLowerCase()?.includes('crypto')) {
      return { isOpen: true, reason: 'Crypto markets are 24/7' };
    }

    // Check if this is an Indian instrument (MCX, NSE, BSE)
    const isIndianInstrument = selectedInstrument?.exchange && 
      ['NSE', 'BSE', 'NFO', 'BFO', 'MCX'].includes(selectedInstrument.exchange.toUpperCase());
    
    const category = selectedInstrument?.category?.toLowerCase() || '';
    const isIndianCategory = category.includes('nse') || category.includes('bse') || 
                             category.includes('mcx') || category.includes('nfo') || 
                             category.includes('bfo');

    if (isIndianInstrument || isIndianCategory) {
      // Indian markets closed on weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return { isOpen: false, reason: 'Indian markets closed on weekends' };
      }
      return { isOpen: true, reason: 'Indian market hours' };
    }

    // Forex & Commodities (XAUUSD, EURUSD, etc.): 24/5 trading
    // Closed from Friday 22:00 UTC to Sunday 22:00 UTC
    if (dayOfWeek === 6) {
      return { isOpen: false, reason: 'Forex/Commodities market closed on Saturday' };
    }
    if (dayOfWeek === 0 && hour < 22) {
      return { isOpen: false, reason: 'Forex/Commodities market opens Sunday 22:00 UTC' };
    }
    if (dayOfWeek === 5 && hour >= 22) {
      return { isOpen: false, reason: 'Forex/Commodities market closed Friday 22:00 UTC' };
    }

    return { isOpen: true, reason: 'Market is open' };
  };

  // Calculate required margin for the current order (MT5 Standard Formula)
  // Margin = (Lots × Contract Size × Price) / Leverage
  const calculateRequiredMargin = () => {
    const vol = parseFloat(volume) || 0.01;
    const livePrice = livePrices[selectedSymbol];
    const price = livePrice?.ask || selectedInstrument?.ask || 0;

    if (tradingMode === 'binary') {
      return parseFloat(binaryAmount) || 0;
    }

    if (tradingMode === 'netting') {
      // Netting mode margin calculation
      // For Indian instruments: Margin = (Lots × LotSize × Price) / Leverage × MarginPercent
      // LotSize comes from instrument (1 for equity, varies for F&O)
      const lotSize = selectedInstrument?.lotSize || 1;
      const quantity = vol * lotSize;
      const totalValue = quantity * price;
      const leveragedValue = totalValue / leverage;
      // Intraday = 20% margin, Carry Forward = 100%
      const marginPercent = orderSession === 'intraday' ? 0.20 : 1.0;
      return leveragedValue * marginPercent;
    }

    // Hedging mode - MT5 margin calculation
    let contractSize;

    if (selectedSymbol.includes('BTC')) {
      contractSize = 1; // 1 lot = 1 BTC
    } else if (selectedSymbol.includes('ETH')) {
      contractSize = 1; // 1 lot = 1 ETH
    } else if (selectedSymbol.includes('ADA')) {
      contractSize = 1000; // 1 lot = 1000 ADA
    } else if (selectedSymbol === 'XAUUSD') {
      contractSize = 100; // 1 lot = 100 oz
    } else if (selectedSymbol === 'XAGUSD') {
      contractSize = 5000; // 1 lot = 5000 oz
    } else if (selectedSymbol === 'XPTUSD') {
      contractSize = 100; // 1 lot = 100 oz
    } else if (selectedSymbol === 'US100' || selectedSymbol === 'US30' || selectedSymbol === 'US2000') {
      contractSize = 1; // 1 lot = $1 per point
    } else if (selectedSymbol === 'BRENT' || selectedSymbol.includes('OIL')) {
      contractSize = 1000; // 1 lot = 1000 barrels
    } else {
      contractSize = 100000; // Standard forex: 1 lot = 100,000 units
    }

    // MT5 Margin Formula: (Lots × Contract Size × Price) / Leverage
    return (vol * contractSize * price) / leverage;
  };

  // Handle order submission
  const handlePlaceOrder = async () => {
    if (isPlacingOrder) return;
    setIsPlacingOrder(true);
    try {
      // Check market hours based on symbol type
      const marketStatus = checkMarketHours(selectedSymbol);
      if (!marketStatus.isOpen) {
        alert(`❌ Market Closed\n\n${selectedSymbol} is currently not available for trading.\n\n${marketStatus.reason}`);
        return;
      }

      // Check wallet balance before placing order
      const requiredMargin = calculateRequiredMargin();
      if (walletData.freeMargin < requiredMargin) {
        alert(`❌ Insufficient Balance\n\nRequired margin: $${requiredMargin.toFixed(2)}\nAvailable free margin: $${walletData.freeMargin.toFixed(2)}\n\nPlease deposit funds to continue trading.`);
        return;
      }

      // Get live price or fallback to static instrument price
      const livePrice = livePrices[selectedSymbol];
      const hasLiveData = livePrice && (livePrice.bid > 0 || livePrice.ask > 0);

      // Use live prices if available, otherwise use static instrument prices
      const currentBid = hasLiveData ? livePrice.bid : selectedInstrument.bid;
      const currentAsk = hasLiveData ? livePrice.ask : selectedInstrument.ask;

      // Block if no price at all
      if (!currentBid || !currentAsk || currentBid <= 0 || currentAsk <= 0) {
        alert(`❌ No Price Data\n\n${selectedSymbol} has no price data available.`);
        return;
      }

      const marketOpen = true;

      let orderPayload;

      const vol = parseFloat(volume) || 0.01;

      if (tradingMode === 'hedging') {
        orderPayload = {
          mode: 'hedging',
          userId: user?.id || 'guest',
          symbol: selectedSymbol,
          orderType,
          side: orderSide,
          volume: vol,
          price: orderType === 'market'
            ? (orderSide === 'buy' ? currentAsk : currentBid)
            : orderType === 'limit' ? parseFloat(limitPrice) : parseFloat(stopPrice),
          stopLoss: stopLoss || parseFloat(calculateSlPrice()),
          takeProfit: takeProfit || parseFloat(calculateTpPrice()),
          leverage,
          isMarketOpen: marketOpen
        };
      } else if (tradingMode === 'netting') {
        orderPayload = {
          mode: 'netting',
          userId: user?.id || 'guest',
          symbol: selectedSymbol,
          orderType,
          side: orderSide,
          volume: vol,
          price: orderType === 'market'
            ? (orderSide === 'buy' ? currentAsk : currentBid)
            : parseFloat(limitPrice),
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          takeProfit: takeProfit ? parseFloat(takeProfit) : null,
          leverage, // Pass leverage for netting mode
          session: orderSession,
          isMarketOpen: marketOpen
        };
      } else if (tradingMode === 'binary') {
        const effectiveRate = usdInrRate + usdMarkup;
        const amountInUsd =
          displayCurrency === 'INR' ? binaryAmount / effectiveRate : binaryAmount;
        orderPayload = {
          mode: 'binary',
          userId: user?.id || 'guest',
          symbol: selectedSymbol,
          direction: binaryDirection,
          amount: amountInUsd,
          expiry: binaryExpiry,
          entryPrice: currentBid,
          isMarketOpen: marketOpen
        };
      }

      console.log('Placing order:', orderPayload);

      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      const result = await response.json();

      if (result.success) {
        // Update wallet if returned
        if (result.wallet) {
          setWalletData(result.wallet);
        }

        fetchPositions();

        // Reset order fields after successful order
        setLimitPrice('');
        setStopPrice('');
        setStopLoss('');
        setTakeProfit('');

        if (tradingMode === 'hedging') {
          showNotification(`${orderSide.toUpperCase()} ${vol} lots ${selectedSymbol} @ ${orderPayload.price}`, 'success');
        } else if (tradingMode === 'netting') {
          showNotification(`${orderSide.toUpperCase()} ${vol} lots ${selectedSymbol} @ ${orderPayload.price}`, 'success');
        } else if (tradingMode === 'binary') {
          const expiryText = binaryExpiry >= 3600 ? `${Math.floor(binaryExpiry / 3600)}h` : `${Math.floor(binaryExpiry / 60)}m`;
          showNotification(
            `${binaryDirection.toUpperCase()} ${displayCurrency === 'INR' ? '₹' : '$'}${binaryAmount} on ${selectedSymbol} - ${expiryText}`,
            'success'
          );
        }
      } else {
        showNotification(`Order failed: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Order error:', error);
      showNotification(`Server error: ${error.message}`, 'error');
    } finally {
      setIsPlacingOrder(false);
    }
  };


  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.setAttribute('data-theme', newDark ? 'dark' : 'light');
    localStorage.setItem('SetupFX-dark-mode', String(newDark));
  };

  // Get TradingView symbol format
  const getTVSymbol = (symbol) => {
    const symbolMap = {
      'XAUUSD': 'OANDA:XAUUSD',
      'XAGUSD': 'OANDA:XAGUSD',
      'XPTUSD': 'OANDA:XPTUSD',
      'BTCUSD': 'BITSTAMP:BTCUSD',
      'ETHUSD': 'BITSTAMP:ETHUSD',
      'EURUSD': 'OANDA:EURUSD',
      'GBPUSD': 'OANDA:GBPUSD',
      'USDJPY': 'OANDA:USDJPY',
      'US100': 'PEPPERSTONE:NAS100',
      'US500': 'PEPPERSTONE:US500',
      'US30': 'PEPPERSTONE:US30',
      'AAPL': 'NASDAQ:AAPL',
      'MSFT': 'NASDAQ:MSFT',
      'GOOGL': 'NASDAQ:GOOGL',
      'NVDA': 'NASDAQ:NVDA',
      'TSLA': 'NASDAQ:TSLA',
      'BRENT': 'TVC:UKOIL',
      'WTI': 'TVC:USOIL',
    };
    return symbolMap[symbol] || `OANDA:${symbol}`;
  };

  // TradingView Advanced Chart Widget
  useEffect(() => {
    const container = document.getElementById('tradingview-widget');
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    // Create the widget container div
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container__widget';
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';
    container.appendChild(widgetContainer);

    // Create widget script with inline configuration
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": getTVSymbol(selectedSymbol),
      "interval": "1",
      "timezone": "Asia/Kolkata",
      "theme": isDark ? "dark" : "light",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "hide_top_toolbar": false,
      "hide_legend": false,
      "save_image": false,
      "calendar": false,
      "hide_volume": false,
      "support_host": "https://www.tradingview.com"
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [selectedSymbol, isDark]);


  return (
    <div className="app">
      {/* iOS Style Trade Notifications */}
      <div className="ios-notification-container">
        {notifications.map(n => (
          <div key={n.id} className={`ios-notification ios-notification-${n.type}`}>
            <div className="ios-notif-icon">
              {n.type === 'success' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : n.type === 'error' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <div className="ios-notif-content">
              <span className="ios-notif-title">
                {n.type === 'success' ? 'Trade Executed' : n.type === 'error' ? 'Trade Failed' : 'Notification'}
              </span>
              <span className="ios-notif-message">{n.message}</span>
            </div>
            <div className="ios-notif-time">Just now</div>
          </div>
        ))}
      </div>

      {/* Header with Navigation */}
      <header className="header">
        <div className="header-left">
          <span className="logo">SetupFX</span>
        </div>
        <div className="header-nav">
          <button
            className={`nav-btn ${activePage === 'home' ? 'active' : ''}`}
            onClick={() => setActivePage('home')}
          >
            Home
          </button>
          <button
            className={`nav-btn ${activePage === 'market' ? 'active' : ''}`}
            onClick={() => setActivePage('market')}
          >
            Market
          </button>
          <button
            className={`nav-btn ${activePage === 'orders' ? 'active' : ''}`}
            onClick={() => setActivePage('orders')}
          >
            Orders
          </button>
          <button
            className={`nav-btn ${activePage === 'wallet' ? 'active' : ''}`}
            onClick={() => setActivePage('wallet')}
          >
            Wallet
          </button>
          <button
            className={`nav-btn ${activePage === 'business' ? 'active' : ''}`}
            onClick={() => setActivePage('business')}
          >
            Business
          </button>
          <button
            className={`nav-btn ${activePage === 'masters' ? 'active' : ''}`}
            onClick={() => setActivePage('masters')}
          >
            Masters
          </button>
          <button
            className={`nav-btn ${activePage === 'settings' ? 'active' : ''}`}
            onClick={() => setActivePage('settings')}
          >
            Settings
          </button>
        </div>
        <div className="header-right">
          <div className={`connection-status ${isMetaApiConnected ? 'connected' : 'disconnected'}`} title={isMetaApiConnected ? 'MetaAPI Connected' : 'MetaAPI Disconnected'}>
            <span className="status-dot"></span>
            <span className="status-text">{isMetaApiConnected ? 'Live' : 'Offline'}</span>
          </div>
          {user && (
            <div className="user-menu">
              <div
                className="user-profile-icon"
                onClick={() => setActivePage('settings')}
                title={`${user.name} (${user.oderId || user.id})`}
              >
                {user.avatar ? (
                  <img src={`${API_URL}${user.avatar}`} alt="Profile" />
                ) : (
                  <div className="avatar-mini">
                    {user.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <span className="user-name">{user.name}</span>
              <span className="user-id">#{user.oderId || user.id}</span>
            </div>
          )}
          <button className="theme-toggle" onClick={toggleTheme} title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {isDark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {/* Market Page - Trading UI */}
        {activePage === 'market' && (
          <>
            {/* Instruments Panel */}
            <div className={`instruments-panel ${instrumentsPanelCollapsed ? 'collapsed' : ''}`}>
              <div className="panel-header">
                <button
                  className="collapse-btn"
                  onClick={() => setInstrumentsPanelCollapsed(!instrumentsPanelCollapsed)}
                  title={instrumentsPanelCollapsed ? 'Expand' : 'Collapse'}
                >
                  {instrumentsPanelCollapsed ? '▶' : '◀'}
                </button>
                {!instrumentsPanelCollapsed && <span className="panel-title">Instruments</span>}
              </div>
              {!instrumentsPanelCollapsed && (
                <>
                  <div className="search-box">
                    <input
                      type="text"
                      placeholder="Search eg: EUR/USD, BTC"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                  </div>
                  <div className="filter-tabs">
                    <button
                      className={`filter-tab ${filterTab === 'FAVORITES' ? 'active' : ''}`}
                      onClick={() => setFilterTab('FAVORITES')}
                    >
                      FAVORITES
                    </button>
                    <button
                      className={`filter-tab ${filterTab === 'ALL SYMBOLS' ? 'active' : ''}`}
                      onClick={() => setFilterTab('ALL SYMBOLS')}
                    >
                      ALL SYMBOLS
                    </button>
                  </div>

                  <div className="instruments-list">
                    {filterTab === 'FAVORITES' ? (
                      /* Favorites/Watchlist View - Shows bid/ask/low/high with trading buttons */
                      watchlist.length > 0 ? (
                        watchlist.map(symbol => {
                          const staticInst = allInstruments.find(i => i.symbol === symbol);
                          if (!staticInst) return null;
                          const inst = getInstrumentWithLivePrice(staticInst);
                          return (
                            <div
                              key={inst.symbol}
                              className={`instrument-row-detailed ${selectedSymbol === inst.symbol ? 'selected' : ''}`}
                              onClick={() => addChartTab(inst.symbol)}
                            >
                              {/* Top Row: Symbol + Bid/Ask */}
                              <div className="inst-top-row">
                                <div className="inst-left">
                                  <span className="inst-symbol">{inst.symbol}</span>
                                  <span className={`inst-change ${inst.change >= 0 ? 'positive' : 'negative'}`}>
                                    {inst.change >= 0 ? '+' : ''}{inst.change.toFixed(2)}% ⇌ {inst.pips}
                                  </span>
                                </div>
                                <div className="inst-prices">
                                  <div className="price-col bid">
                                    <span className="price-value">{inst.bid.toFixed(inst.bid < 10 ? 5 : 2)}</span>
                                    <span className="price-label">L: {inst.low.toFixed(inst.low < 10 ? 5 : 2)}</span>
                                  </div>
                                  <div className="price-col ask">
                                    <span className="price-value">{inst.ask.toFixed(inst.ask < 10 ? 5 : 2)}</span>
                                    <span className="price-label">H: {inst.high.toFixed(inst.high < 10 ? 5 : 2)}</span>
                                  </div>
                                </div>
                              </div>
                              {/* Bottom Row: Trading buttons - Delete, B, Lot, S, Chart (only when One Click ON) */}
                              {oneClickMode && (
                                <div
                                  className="trading-actions"
                                  onClick={(e) => e.stopPropagation()}
                                  style={
                                    isOneClickSymbolBusy(inst.symbol, oneClickPending)
                                      ? { opacity: 0.92 }
                                      : undefined
                                  }
                                  title={
                                    isOneClickSymbolBusy(inst.symbol, oneClickPending)
                                      ? 'Order in progress…'
                                      : undefined
                                  }
                                >
                                  <button className="trash-btn" onClick={(e) => toggleWatchlist(inst.symbol, e)}>🗑</button>
                                  <button
                                    type="button"
                                    className="buy-btn-small"
                                    style={getOneClickTradeButtonStyle(inst.symbol, 'buy', oneClickPending)}
                                    onClick={() => handleExecuteOrder(inst.symbol, 'buy')}
                                    disabled={isOneClickSymbolBusy(inst.symbol, oneClickPending)}
                                  >
                                    B
                                  </button>
                                  <input
                                    type="text"
                                    className="lot-input"
                                    value={oneClickLotSize}
                                    disabled={isOneClickSymbolBusy(inst.symbol, oneClickPending)}
                                    onChange={(e) => setOneClickLotSize(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    type="button"
                                    className="sell-btn-small"
                                    style={getOneClickTradeButtonStyle(inst.symbol, 'sell', oneClickPending)}
                                    onClick={() => handleExecuteOrder(inst.symbol, 'sell')}
                                    disabled={isOneClickSymbolBusy(inst.symbol, oneClickPending)}
                                  >
                                    S
                                  </button>
                                  <button className="chart-btn-small" onClick={() => addChartTab(inst.symbol)}>+</button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="no-favorites">No favorites added</div>
                      )
                    ) : (
                      /* All Symbols - Simple view with just add button */
                      Object.entries(instrumentsByCategory).map(([segment, instruments]) => {
                        const filteredBySearch = searchQuery
                          ? instruments.filter(i =>
                            i.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            i.name.toLowerCase().includes(searchQuery.toLowerCase())
                          )
                          : instruments;

                        if (searchQuery && filteredBySearch.length === 0) return null;

                        return (
                          <div key={segment} className="segment-group">
                            <div
                              className={`segment-header ${expandedSegments[segment] ? 'expanded' : ''}`}
                              onClick={() => toggleSegment(segment)}
                            >
                              <span className="segment-name">{segment}</span>
                              <svg
                                className={`segment-arrow ${expandedSegments[segment] ? 'expanded' : ''}`}
                                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                              >
                                <polyline points="6 9 12 15 18 9"></polyline>
                              </svg>
                            </div>
                            {expandedSegments[segment] && (
                              <div className="segment-instruments">
                                {filteredBySearch.map(inst => (
                                  <div
                                    key={inst.symbol}
                                    className={`instrument-row ${selectedSymbol === inst.symbol ? 'selected' : ''}`}
                                    onClick={() => addChartTab(inst.symbol)}
                                  >
                                    <div className="inst-info">
                                      <span className="inst-symbol">{inst.symbol}</span>
                                      <span className="inst-category">{inst.category}</span>
                                    </div>
                                    <button
                                      className={`watchlist-btn ${isBrokerVariantInWatchlist(watchlist, inst.symbol) ? 'added' : ''}`}
                                      onClick={(e) => toggleWatchlist(inst.symbol, e)}
                                      title={isBrokerVariantInWatchlist(watchlist, inst.symbol) ? 'Remove from watchlist' : 'Add to watchlist'}
                                    >
                                      {isBrokerVariantInWatchlist(watchlist, inst.symbol) ? '✓' : '+'}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Chart Area */}
            <div className="chart-section">
              {/* Chart Tabs Bar */}
              <div className="chart-tabs-bar">
                <div className="chart-tabs">
                  {chartTabs.map(symbol => (
                    <div
                      key={symbol}
                      className={`chart-tab ${selectedSymbol === symbol ? 'active' : ''}`}
                      onClick={() => setSelectedSymbol(symbol)}
                    >
                      <span>{symbol}</span>
                      {chartTabs.length > 1 && (
                        <button className="close-tab" onClick={(e) => removeChartTab(symbol, e)}>×</button>
                      )}
                    </div>
                  ))}
                  <button className="add-tab">+</button>
                </div>
              </div>
              {/* Chart Container - TradingView Widget */}
              <div className="chart-container">
                <div id="tradingview-widget" className="tradingview-widget-container"></div>
              </div>

              {/* Order Book */}
              <div className="order-book">
                <div className="order-tabs">
                  <button
                    className={`order-tab ${activeTab === 'positions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('positions')}
                  >
                    Positions({positions.length})
                  </button>
                  <button
                    className={`order-tab ${activeTab === 'pending' ? 'active' : ''}`}
                    onClick={() => setActiveTab('pending')}
                  >
                    Pending({pendingOrders.length})
                  </button>
                  <button
                    className={`order-tab ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                  >
                    History({tradeHistory.length})
                  </button>
                  <button
                    className={`order-tab ${activeTab === 'cancelled' ? 'active' : ''}`}
                    onClick={() => setActiveTab('cancelled')}
                  >
                    Cancelled({cancelledOrders.length})
                  </button>
                  <div className="order-controls">
                    <div className="currency-toggle">
                      <button
                        className={`curr-btn ${displayCurrency === 'USD' ? 'active' : ''}`}
                        onClick={() => handleCurrencyChange('USD')}
                      >
                        $ USD
                      </button>
                      <button
                        className={`curr-btn ${displayCurrency === 'INR' ? 'active' : ''}`}
                        onClick={() => handleCurrencyChange('INR')}
                      >
                        ₹ INR
                      </button>
                    </div>
                    <label className="one-click">
                      One Click
                      <input
                        type="checkbox"
                        checked={oneClickMode}
                        onChange={(e) => setOneClickMode(e.target.checked)}
                      />
                    </label>
                    <span className={`pnl ${totalPnL >= 0 ? 'profit' : 'loss'}`}>
                      P/L: {totalPnL >= 0 ? '+' : ''}{displayCurrency === 'INR' ? '₹' : '$'}{displayCurrency === 'INR' ? (totalPnL * usdInrRate).toFixed(2) : totalPnL.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="positions-content">
                  {/* POSITIONS TAB */}
                  {activeTab === 'positions' && (
                    <table className="positions-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Sym</th>
                          <th>Side</th>
                          <th>Size</th>
                          <th>Entry</th>
                          <th>Current</th>
                          <th>P/L</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="no-data">No open positions</td>
                          </tr>
                        ) : (
                          positions.map((pos) => {
                            const livePrice = livePrices[pos.symbol];
                            const hasLivePrice = livePrice && (livePrice.bid || livePrice.ask);
                            const currentPrice = pos.side === 'buy'
                              ? (livePrice?.bid || pos.currentPrice || pos.entryPrice)
                              : (livePrice?.ask || pos.currentPrice || pos.entryPrice);
                            const priceDiff = pos.side === 'buy'
                              ? currentPrice - (pos.entryPrice || pos.avgPrice)
                              : (pos.entryPrice || pos.avgPrice) - currentPrice;
                            const posMode = pos.mode || tradingMode;

                            // Calculate profit based on symbol type (MT5 Standard Formula)
                            const calculateProfit = () => {
                              if (posMode === 'binary') {
                                return (pos.payout || 0) - (pos.amount || 0);
                              }

                              // Both hedging and netting now use volume (lots) with MT5 formula
                              const vol = pos.volume || pos.quantity || 0;
                              const symbol = pos.symbol || '';
                              let contractSize;

                              if (symbol.includes('BTC')) {
                                contractSize = 1; // 1 lot = 1 BTC
                              } else if (symbol.includes('ETH')) {
                                contractSize = 1; // 1 lot = 1 ETH
                              } else if (symbol === 'XAUUSD') {
                                contractSize = 100; // 1 lot = 100 oz
                              } else if (symbol === 'XAGUSD') {
                                contractSize = 5000; // 1 lot = 5000 oz
                              } else if (symbol === 'XPTUSD') {
                                contractSize = 100; // 1 lot = 100 oz
                              } else if (symbol === 'US100' || symbol === 'US2000' || symbol === 'US30' || symbol === 'US500') {
                                contractSize = 1; // 1 lot = $1 per point
                              } else if (symbol.includes('JPY')) {
                                // JPY pairs: convert to USD
                                contractSize = 100000;
                                return (priceDiff * contractSize * vol) / 100;
                              } else {
                                contractSize = 100000; // Standard forex: 1 lot = 100,000 units
                              }

                              return priceDiff * contractSize * vol;
                            };
                            const profit = calculateProfit();

                            const getModeShort = (mode) => {
                              switch (mode) {
                                case 'hedging': return 'H';
                                case 'netting': return 'N';
                                case 'binary': return 'B';
                                default: return mode?.charAt(0)?.toUpperCase();
                              }
                            };

                            const getSize = () => {
                              if (posMode === 'binary') return `$${pos.amount}`;
                              // Both netting and hedging now use volume (lots)
                              const vol = pos.volume || pos.quantity || 0;
                              return vol.toFixed ? vol.toFixed(2) : vol;
                            };

                            const formatTime = (dateStr) => {
                              const d = new Date(dateStr);
                              const h = d.getHours();
                              const m = d.getMinutes().toString().padStart(2, '0');
                              const ampm = h >= 12 ? 'pm' : 'am';
                              const h12 = h % 12 || 12;
                              return `${h12}:${m}${ampm}`;
                            };

                            const formatDate = (dateStr) => {
                              const d = new Date(dateStr);
                              return `${d.getDate()}/${d.getMonth() + 1}`;
                            };

                            const sideShort = (pos.side || pos.direction)?.charAt(0)?.toUpperCase();
                            const isBuy = (pos.side || pos.direction) === 'buy' || (pos.side || pos.direction) === 'up';

                            // Binary countdown timer
                            const getBinaryCountdown = () => {
                              if (posMode !== 'binary' || !pos.expiryTime) return null;
                              const now = new Date().getTime();
                              const expiry = new Date(pos.expiryTime).getTime();
                              const remaining = Math.max(0, Math.floor((expiry - now) / 1000));
                              if (remaining <= 0) return '00:00';

                              const days = Math.floor(remaining / 86400);
                              const hours = Math.floor((remaining % 86400) / 3600);
                              const mins = Math.floor((remaining % 3600) / 60);
                              const secs = remaining % 60;

                              if (days > 0) {
                                return `${days}d ${hours}h`;
                              } else if (hours > 0) {
                                return `${hours}h ${mins.toString().padStart(2, '0')}m`;
                              } else {
                                return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                              }
                            };

                            const binaryCountdown = getBinaryCountdown();
                            const isExpired = posMode === 'binary' && binaryCountdown === '00:00';

                            return (
                              <tr key={pos.oderId || pos._id || pos.tradeId} className={`${profit >= 0 ? 'profit-row' : 'loss-row'} ${posMode === 'binary' ? 'binary-row' : ''}`}>
                                <td>
                                  {posMode === 'binary' ? (
                                    <span className={`binary-timer ${isExpired ? 'expired' : ''}`}>⏱ {binaryCountdown}</span>
                                  ) : (
                                    formatTime(pos.openTime || pos.createdAt)
                                  )}
                                </td>
                                <td><span className={`mode-badge ${posMode}`}>{getModeShort(posMode)}</span> {pos.symbol}</td>
                                <td className={isBuy ? 'buy-text' : 'sell-text'}>{isBuy ? '▲' : '▼'} {posMode === 'binary' ? (pos.direction === 'up' ? 'UP' : 'DN') : sideShort}</td>
                                <td>{getSize()}</td>
                                <td>{formatPrice(pos.entryPrice || pos.avgPrice, pos.symbol, true)}</td>
                                <td>{hasLivePrice ? formatPrice(currentPrice, pos.symbol, true) : '-'}</td>
                                <td className={profit >= 0 ? 'profit-text' : 'loss-text'}>
                                  {posMode === 'binary' && pos.status === 'active' ? (
                                    <span className="binary-pending">Pending</span>
                                  ) : (
                                    `${profit >= 0 ? '+' : ''}${displayCurrency === 'INR' ? '₹' : '$'}${displayCurrency === 'INR' ? (profit * usdInrRate).toFixed(2) : profit.toFixed(2)}`
                                  )}
                                </td>
                                <td>
                                  {posMode !== 'binary' && (
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

                  {/* PENDING TAB */}
                  {activeTab === 'pending' && (
                    <table className="positions-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Symbol</th>
                          <th>Type</th>
                          <th>Side</th>
                          <th>Size</th>
                          <th>Price</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingOrders.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="no-data">No pending orders</td>
                          </tr>
                        ) : (
                          pendingOrders.map((order) => (
                            <tr key={order.oderId || order._id}>
                              <td>{new Date(order.openTime || order.createdAt).toLocaleTimeString()}</td>
                              <td><span className={`mode-badge ${order.mode}`}>{order.mode?.charAt(0).toUpperCase()}</span> {order.symbol}</td>
                              <td>{order.orderType?.toUpperCase()}</td>
                              <td className={order.side === 'buy' ? 'buy-text' : 'sell-text'}>{order.side?.toUpperCase()}</td>
                              <td>{order.volume || order.quantity}</td>
                              <td>{displayCurrency === 'INR' ? '₹' : ''}{displayCurrency === 'INR' ? (Number(order.entryPrice || 0) * (usdInrRate + usdMarkup)).toFixed(2) : Number(order.entryPrice || 0).toFixed(2)}</td>
                              <td><span className="status-pending">Pending</span></td>
                              <td>
                                <button className="act-btn close" onClick={() => alert('Cancel order feature coming soon')} title="Cancel">✕</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}

                  {/* HISTORY TAB */}
                  {activeTab === 'history' && (
                    <table className="positions-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Symbol</th>
                          <th>Side</th>
                          <th>Size</th>
                          <th>Entry</th>
                          <th>Close</th>
                          <th>P/L</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tradeHistory.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="no-data">No trade history</td>
                          </tr>
                        ) : (
                          tradeHistory.map((trade) => (
                            <tr key={trade.tradeId || trade._id} className={trade.profit >= 0 ? 'profit-row' : 'loss-row'}>
                              <td>{new Date(trade.executedAt || trade.closedAt).toLocaleDateString()}</td>
                              <td><span className={`mode-badge ${trade.mode}`}>{trade.mode?.charAt(0).toUpperCase()}</span> {trade.symbol}</td>
                              <td className={trade.side === 'buy' || trade.side === 'up' ? 'buy-text' : 'sell-text'}>{trade.side?.toUpperCase()}</td>
                              <td>{trade.volume || trade.quantity || `$${trade.amount}`}</td>
                              <td>{displayCurrency === 'INR' ? '₹' : ''}{displayCurrency === 'INR' ? (Number(trade.entryPrice || 0) * (usdInrRate + usdMarkup)).toFixed(2) : Number(trade.entryPrice || 0).toFixed(2)}</td>
                              <td>{trade.closePrice ? (displayCurrency === 'INR' ? '₹' : '') + (displayCurrency === 'INR' ? (Number(trade.closePrice) * (usdInrRate + usdMarkup)).toFixed(2) : Number(trade.closePrice).toFixed(2)) : '-'}</td>
                              <td className={trade.profit >= 0 ? 'profit-text' : 'loss-text'}>{trade.profit >= 0 ? '+' : ''}{displayCurrency === 'INR' ? '₹' : '$'}{displayCurrency === 'INR' ? (Number(trade.profit || 0) * usdInrRate).toFixed(2) : Number(trade.profit || 0).toFixed(2)}</td>
                              <td>{trade.type}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}

                  {/* CANCELLED TAB */}
                  {activeTab === 'cancelled' && (
                    <table className="positions-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Symbol</th>
                          <th>Side</th>
                          <th>Size</th>
                          <th>Price</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cancelledOrders.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="no-data">No cancelled orders</td>
                          </tr>
                        ) : (
                          cancelledOrders.map((order) => (
                            <tr key={order.tradeId || order._id}>
                              <td>{new Date(order.executedAt).toLocaleDateString()}</td>
                              <td><span className={`mode-badge ${order.mode}`}>{order.mode?.charAt(0).toUpperCase()}</span> {order.symbol}</td>
                              <td>{order.side?.toUpperCase()}</td>
                              <td>{order.volume || order.quantity || `$${order.amount}`}</td>
                              <td>{displayCurrency === 'INR' ? '₹' : ''}{displayCurrency === 'INR' ? (Number(order.entryPrice || 0) * (usdInrRate + usdMarkup)).toFixed(2) : Number(order.entryPrice || 0).toFixed(2)}</td>
                              <td>Cancelled</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}

                </div>
              </div>
            </div>

            {/* Edit Position Modal */}
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
                      <span className="volume">{selectedPosition.volume || selectedPosition.quantity} {tradingMode === 'netting' ? 'qty' : 'lots'}</span>
                    </div>
                    <div className="modal-input-group">
                      <label>Stop Loss</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editSL}
                        onChange={(e) => setEditSL(e.target.value)}
                        placeholder="Enter stop loss price"
                      />
                    </div>
                    <div className="modal-input-group">
                      <label>Take Profit</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editTP}
                        onChange={(e) => setEditTP(e.target.value)}
                        placeholder="Enter take profit price"
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="modal-btn cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
                    <button className="modal-btn confirm" onClick={handleModifyPosition}>Save Changes</button>
                  </div>
                </div>
              </div>
            )}

            {/* Close Position Modal */}
            {showCloseModal && selectedPosition && (
              <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
                <div className="modal-content close-modal-pro" onClick={e => e.stopPropagation()}>
                  <div className="close-modal-header">
                    <div className="close-position-badge">
                      <span className={`side-indicator ${selectedPosition.side}`}>{selectedPosition.side?.toUpperCase()}</span>
                      <span className="close-symbol">{selectedPosition.symbol}</span>
                      <span className="close-volume">{selectedPosition.volume || selectedPosition.quantity} lots</span>
                    </div>
                    <button className="modal-close" onClick={() => setShowCloseModal(false)}>×</button>
                  </div>

                  <div className="close-modal-body">
                    <div className="close-actions-row">
                      <button className="close-action-btn primary" onClick={() => handleClosePosition(selectedPosition, selectedPosition.volume || selectedPosition.quantity)}>
                        Close Position
                      </button>
                      <button className="close-action-btn secondary" onClick={async () => {
                        if (confirm('Close ALL positions?')) {
                          for (const pos of positions) { await handleClosePosition(pos, pos.volume || pos.quantity); }
                        }
                      }}>
                        Close All
                      </button>
                    </div>

                    <div className="close-actions-row">
                      <button className="close-action-btn profit-btn" onClick={async () => {
                        const profitPos = positions.filter(pos => {
                          const lp = livePrices[pos.symbol];
                          const cp = pos.side === 'buy' ? (lp?.bid || pos.currentPrice) : (lp?.ask || pos.currentPrice);
                          return (pos.side === 'buy' ? cp - pos.entryPrice : pos.entryPrice - cp) > 0;
                        });
                        if (profitPos.length === 0) { alert('No profitable positions'); return; }
                        if (confirm(`Close ${profitPos.length} profit position(s)?`)) {
                          for (const pos of profitPos) { await handleClosePosition(pos, pos.volume || pos.quantity); }
                        }
                      }}>
                        Close Profit ({positions.filter(pos => {
                          const lp = livePrices[pos.symbol];
                          const cp = pos.side === 'buy' ? (lp?.bid || pos.currentPrice) : (lp?.ask || pos.currentPrice);
                          return (pos.side === 'buy' ? cp - pos.entryPrice : pos.entryPrice - cp) > 0;
                        }).length})
                      </button>
                      <button className="close-action-btn loss-btn" onClick={async () => {
                        const lossPos = positions.filter(pos => {
                          const lp = livePrices[pos.symbol];
                          const cp = pos.side === 'buy' ? (lp?.bid || pos.currentPrice) : (lp?.ask || pos.currentPrice);
                          return (pos.side === 'buy' ? cp - pos.entryPrice : pos.entryPrice - cp) < 0;
                        });
                        if (lossPos.length === 0) { alert('No losing positions'); return; }
                        if (confirm(`Close ${lossPos.length} loss position(s)?`)) {
                          for (const pos of lossPos) { await handleClosePosition(pos, pos.volume || pos.quantity); }
                        }
                      }}>
                        Close Loss ({positions.filter(pos => {
                          const lp = livePrices[pos.symbol];
                          const cp = pos.side === 'buy' ? (lp?.bid || pos.currentPrice) : (lp?.ask || pos.currentPrice);
                          return (pos.side === 'buy' ? cp - pos.entryPrice : pos.entryPrice - cp) < 0;
                        }).length})
                      </button>
                    </div>

                    <div className="partial-section">
                      <div className="partial-header">Partial Close</div>
                      <div className="partial-input-row">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={selectedPosition.volume || selectedPosition.quantity}
                          value={closeVolume}
                          onChange={(e) => setCloseVolume(e.target.value)}
                          placeholder="Volume"
                        />
                        <button className="partial-close-btn" onClick={() => handleClosePosition(selectedPosition, parseFloat(closeVolume))}>
                          Close
                        </button>
                      </div>
                      <div className="partial-presets">
                        <button onClick={() => setCloseVolume(((selectedPosition.volume || selectedPosition.quantity) * 0.25).toFixed(2))}>25%</button>
                        <button onClick={() => setCloseVolume(((selectedPosition.volume || selectedPosition.quantity) * 0.5).toFixed(2))}>50%</button>
                        <button onClick={() => setCloseVolume(((selectedPosition.volume || selectedPosition.quantity) * 0.75).toFixed(2))}>75%</button>
                        <button className="active" onClick={() => setCloseVolume(selectedPosition.volume || selectedPosition.quantity)}>100%</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Order Panel - Dynamic based on Trading Mode */}
            <div className="order-panel">
              <div className="order-header">
                <span className="order-symbol">{selectedSymbol} order</span>
              </div>

              {/* Trading Mode Tabs - Only show allowed modes */}
              <div className="trading-mode-tabs">
                {allowedTradeModes.hedging && (
                  <button
                    className={`mode-tab ${tradingMode === 'hedging' ? 'active' : ''}`}
                    onClick={() => setTradingMode('hedging')}
                    title="Forex/Crypto - Multiple positions allowed"
                  >
                    🔄 Hedging
                  </button>
                )}
                {allowedTradeModes.netting && (
                  <button
                    className={`mode-tab ${tradingMode === 'netting' ? 'active' : ''}`}
                    onClick={() => setTradingMode('netting')}
                    title="Indian Market - Net position per symbol"
                  >
                    📊 Netting
                  </button>
                )}
                {allowedTradeModes.binary && (
                  <button
                    className={`mode-tab ${tradingMode === 'binary' ? 'active' : ''}`}
                    onClick={() => setTradingMode('binary')}
                    title="Time-based UP/DOWN trades"
                  >
                    ⏱️ Binary
                  </button>
                )}
              </div>

              {/* ========== HEDGING MODE UI ========== */}
              {tradingMode === 'hedging' && (
                <>
                  <div
                    className={isPlacingOrder ? 'order-panel-executing' : undefined}
                    aria-busy={isPlacingOrder}
                    title={isPlacingOrder ? 'Order in progress…' : undefined}
                  >
                  {/* Order Type Tabs */}
                  <div className="order-type-tabs">
                    <button className={`type-tab ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Market</button>
                    <button className={`type-tab ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>Limit</button>
                    <button className={`type-tab ${orderType === 'stop' ? 'active' : ''}`} onClick={() => setOrderType('stop')}>Stop</button>
                  </div>

                  {/* Buy/Sell Price Display */}
                  <div className="price-buttons">
                    <button className={`price-btn sell ${orderSide === 'sell' ? 'active' : ''}`} onClick={() => setOrderSide('sell')}>
                      <span className="side-label">SELL</span>
                      <span className="side-price">{selectedInstrument.bid.toFixed(selectedInstrument.bid < 10 ? 5 : 2)}</span>
                    </button>
                    <button className={`price-btn buy ${orderSide === 'buy' ? 'active' : ''}`} onClick={() => setOrderSide('buy')}>
                      <span className="side-label">BUY</span>
                      <span className="side-price">{selectedInstrument.ask.toFixed(selectedInstrument.ask < 10 ? 5 : 2)}</span>
                    </button>
                  </div>

                  {orderType !== 'market' && (
                    <div className="order-input-group">
                      <label>{orderType === 'limit' ? 'Limit Price' : 'Stop Price'}</label>
                      <input type="number" step="0.01" value={orderType === 'limit' ? limitPrice : stopPrice}
                        onChange={(e) => orderType === 'limit' ? setLimitPrice(e.target.value) : setStopPrice(e.target.value)}
                        placeholder={entryPrice.toFixed(2)} />
                    </div>
                  )}

                  <div className="order-input-group">
                    <label>Volume (Lots)</label>
                    <div className="volume-control">
                      <button onClick={() => setVolume(prev => Math.max(0.01, (parseFloat(prev) || 0.01) - 0.01))}>−</button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={volume}
                        onChange={(e) => {
                          const val = e.target.value;
                          // Allow empty, numbers, and decimal input
                          if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                            setVolume(val);
                          }
                        }}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (isNaN(val) || val < 0.01) {
                            setVolume(0.01);
                          } else {
                            setVolume(parseFloat(val.toFixed(2)));
                          }
                        }}
                      />
                      <button onClick={() => setVolume(prev => (parseFloat(prev) || 0.01) + 0.01)}>+</button>
                    </div>
                  </div>

                  <div className="order-input-group">
                    <label>Leverage</label>
                    <select value={leverage} onChange={(e) => setLeverage(parseInt(e.target.value))}>
                      <option value="10">1:10</option>
                      <option value="50">1:50</option>
                      <option value="100">1:100</option>
                      <option value="200">1:200</option>
                      <option value="500">1:500</option>
                    </select>
                    <div className="margin-info"><span>Margin: ${marginRequired.toFixed(2)}</span></div>
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

                  <div className="trading-charges">
                    <div className="charge-row"><span>Spread</span><span>{selectedInstrument.pips} pips</span></div>
                    <div className="charge-row"><span>Commission</span><span>$0.00</span></div>
                  </div>
                  </div>

                  <button
                    className={`order-submit-btn ${orderSide} ${isPlacingOrder ? 'order-pending' : ''}`}
                    onClick={handlePlaceOrder}
                    disabled={isPlacingOrder}
                  >
                    {orderSide === 'buy' ? 'Open BUY Position' : 'Open SELL Position'}
                  </button>
                </>
              )}

              {/* ========== NETTING MODE UI ========== */}
              {tradingMode === 'netting' && (
                <>
                  <div
                    className={isPlacingOrder ? 'order-panel-executing' : undefined}
                    aria-busy={isPlacingOrder}
                    title={isPlacingOrder ? 'Order in progress…' : undefined}
                  >
                  <div className="order-type-tabs">
                    <button className={`type-tab ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Market</button>
                    <button className={`type-tab ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>Limit</button>
                    <button className={`type-tab ${orderType === 'slm' ? 'active' : ''}`} onClick={() => setOrderType('slm')}>SL-M</button>
                  </div>

                  {/* Intraday / Carry Forward Toggle */}
                  <div className="order-type-tabs session-tabs">
                    <button className={`type-tab ${orderSession === 'intraday' ? 'active intraday' : ''}`} onClick={() => setOrderSession('intraday')}>
                      Intraday
                    </button>
                    <button className={`type-tab ${orderSession === 'carryforward' ? 'active carryforward' : ''}`} onClick={() => setOrderSession('carryforward')}>
                      Carry Forward
                    </button>
                  </div>

                  <div className="price-buttons">
                    <button className={`price-btn sell ${orderSide === 'sell' ? 'active' : ''}`} onClick={() => setOrderSide('sell')}>
                      <span className="side-label">SELL</span>
                      <span className="side-price">{selectedInstrument.bid.toFixed(2)}</span>
                    </button>
                    <button className={`price-btn buy ${orderSide === 'buy' ? 'active' : ''}`} onClick={() => setOrderSide('buy')}>
                      <span className="side-label">BUY</span>
                      <span className="side-price">{selectedInstrument.ask.toFixed(2)}</span>
                    </button>
                  </div>

                  {orderType !== 'market' && (
                    <div className="order-input-group">
                      <label>{orderType === 'limit' ? 'Limit Price' : 'Trigger Price'}</label>
                      <input type="number" step="0.01" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} placeholder={entryPrice.toFixed(2)} />
                    </div>
                  )}

                  <div className="order-input-group">
                    <label>Lot Size</label>
                    <div className="volume-control">
                      <button onClick={() => setVolume(prev => Math.max(0.01, (parseFloat(prev) || 0.01) - 0.01))}>−</button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={volume}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                            setVolume(val === '' ? '0.01' : val);
                          }
                        }}
                      />
                      <button onClick={() => setVolume(prev => ((parseFloat(prev) || 0.01) + 0.01).toFixed(2))}>+</button>
                    </div>
                    <span className="volume-hint">{(parseFloat(volume) || 0.01).toFixed(2)} lots</span>
                  </div>

                  <div className="order-input-group sl-tp">
                    <label>Stop Loss</label>
                    <input type="number" step="0.01" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="Optional" />
                  </div>

                  <div className="order-input-group sl-tp">
                    <label>Target Price</label>
                    <input type="number" step="0.01" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="Optional" />
                  </div>

                  {/* Leverage Selector for Netting */}
                  <div className="order-input-group">
                    <label>Leverage</label>
                    <select value={leverage} onChange={(e) => setLeverage(parseInt(e.target.value))}>
                      <option value={1}>1:1</option>
                      <option value={5}>1:5</option>
                      <option value={10}>1:10</option>
                      <option value={20}>1:20</option>
                      <option value={50}>1:50</option>
                      <option value={100}>1:100</option>
                      <option value={200}>1:200</option>
                      <option value={500}>1:500</option>
                    </select>
                  </div>

                  <div className="trading-charges">
                    <div className="charge-row"><span>Session</span><span>{orderSession === 'intraday' ? 'Intraday (Auto SqOff)' : 'Carry Forward'}</span></div>
                    <div className="charge-row"><span>Leverage</span><span>1:{leverage}</span></div>
                    <div className="charge-row"><span>Margin ({orderSession === 'intraday' ? '20%' : '100%'})</span><span>₹{calculateRequiredMargin().toFixed(2)}</span></div>
                  </div>
                  </div>

                  <button
                    className={`order-submit-btn ${orderSide} ${isPlacingOrder ? 'order-pending' : ''}`}
                    onClick={handlePlaceOrder}
                    disabled={isPlacingOrder}
                  >
                    <>{orderSide === 'buy' ? 'BUY' : 'SELL'} {volumeNum.toFixed(2)} lots</>
                  </button>
                </>
              )}

              {/* ========== BINARY MODE UI ========== */}
              {tradingMode === 'binary' && (
                <>
                  <div
                    className={isPlacingOrder ? 'order-panel-executing' : undefined}
                    aria-busy={isPlacingOrder}
                    title={isPlacingOrder ? 'Order in progress…' : undefined}
                  >
                  <div className="binary-price-display">
                    <span className="current-price-label">Current Price</span>
                    <span className="current-price-value">{selectedInstrument.bid.toFixed(selectedInstrument.bid < 10 ? 5 : 2)}</span>
                  </div>

                  {/* UP / DOWN Buttons */}
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
                      Trade Amount ({displayCurrency === 'INR' ? '₹' : '$'}) — limits ₹{appBinaryStakeMeta.minInr}–₹
                      {appBinaryStakeMeta.maxInr}
                    </label>
                    <div className="volume-control">
                      <button
                        type="button"
                        onClick={() => setBinaryAmount((a) => clampAppBinaryStake(a - appBinaryStakeMeta.stepDisp))}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={appBinaryStakeMeta.minDisp}
                        max={appBinaryStakeMeta.maxDisp}
                        step={displayCurrency === 'INR' ? 1 : 'any'}
                        value={binaryAmount}
                        onChange={(e) => {
                          const raw =
                            displayCurrency === 'INR'
                              ? parseInt(e.target.value, 10)
                              : parseFloat(e.target.value);
                          if (!Number.isFinite(raw)) {
                            setBinaryAmount(clampAppBinaryStake(appBinaryStakeMeta.minDisp));
                            return;
                          }
                          setBinaryAmount(clampAppBinaryStake(raw));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setBinaryAmount((a) => clampAppBinaryStake(a + appBinaryStakeMeta.stepDisp))}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="order-input-group">
                    <label>Expiry Time</label>
                    <div className="expiry-selector">
                      <div className="expiry-input-row">
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={Math.floor(binaryExpiry / (binaryExpiry >= 86400 ? 86400 : binaryExpiry >= 3600 ? 3600 : 60))}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            const unit = binaryExpiry >= 86400 ? 86400 : binaryExpiry >= 3600 ? 3600 : 60;
                            setBinaryExpiry(val * unit);
                          }}
                          className="expiry-value-input"
                        />
                        <select
                          value={binaryExpiry >= 86400 ? 'day' : binaryExpiry >= 3600 ? 'hour' : 'minute'}
                          onChange={(e) => {
                            const currentVal = Math.floor(binaryExpiry / (binaryExpiry >= 86400 ? 86400 : binaryExpiry >= 3600 ? 3600 : 60));
                            const unit = e.target.value === 'day' ? 86400 : e.target.value === 'hour' ? 3600 : 60;
                            setBinaryExpiry(currentVal * unit);
                          }}
                          className="expiry-unit-select"
                        >
                          <option value="minute">Minutes</option>
                          <option value="hour">Hours</option>
                          <option value="day">Days</option>
                        </select>
                      </div>
                      <div className="expiry-quick-options">
                        <button className={`expiry-btn ${binaryExpiry === 60 ? 'active' : ''}`} onClick={() => setBinaryExpiry(60)}>1m</button>
                        <button className={`expiry-btn ${binaryExpiry === 300 ? 'active' : ''}`} onClick={() => setBinaryExpiry(300)}>5m</button>
                        <button className={`expiry-btn ${binaryExpiry === 900 ? 'active' : ''}`} onClick={() => setBinaryExpiry(900)}>15m</button>
                        <button className={`expiry-btn ${binaryExpiry === 3600 ? 'active' : ''}`} onClick={() => setBinaryExpiry(3600)}>1h</button>
                        <button className={`expiry-btn ${binaryExpiry === 14400 ? 'active' : ''}`} onClick={() => setBinaryExpiry(14400)}>4h</button>
                        <button className={`expiry-btn ${binaryExpiry === 86400 ? 'active' : ''}`} onClick={() => setBinaryExpiry(86400)}>1d</button>
                      </div>
                    </div>
                  </div>

                  <div className="binary-payout-info">
                    <div className="payout-row">
                      <span>If you win:</span>
                      <span className="win-amount">
                        +{displayCurrency === 'INR' ? '₹' : '$'}
                        {(binaryAmount * ((appBinarySettings.payoutPercent ?? 85) / 100)).toFixed(2)}
                      </span>
                    </div>
                    <div className="payout-row">
                      <span>If you lose:</span>
                      <span className="lose-amount">
                        -{displayCurrency === 'INR' ? '₹' : '$'}
                        {binaryAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  </div>

                  <button
                    className={`order-submit-btn binary ${binaryDirection} ${isPlacingOrder ? 'order-pending' : ''}`}
                    onClick={handlePlaceOrder}
                    disabled={isPlacingOrder}
                  >
                    <>Trade {binaryDirection.toUpperCase()} - ${binaryAmount}</>
                  </button>

                  <div className="binary-timer-info">
                    <span>Trade expires in {
                      binaryExpiry >= 86400
                        ? `${Math.floor(binaryExpiry / 86400)}d ${Math.floor((binaryExpiry % 86400) / 3600)}h`
                        : binaryExpiry >= 3600
                          ? `${Math.floor(binaryExpiry / 3600)}h ${Math.floor((binaryExpiry % 3600) / 60)}m`
                          : `${Math.floor(binaryExpiry / 60)}m ${binaryExpiry % 60}s`
                    }</span>
                  </div>
                </>
              )}

              {/* Order Summary */}
              <div className="order-summary">
                {tradingMode === 'hedging' && <span>{volumeNum.toFixed(2)} lots @ {entryPrice.toFixed(selectedInstrument.bid < 10 ? 5 : 2)}</span>}
                {tradingMode === 'netting' && <span>{volumeNum.toFixed(2)} lots @ {entryPrice.toFixed(2)} ({orderSession})</span>}
                {tradingMode === 'binary' && <span>${binaryAmount} on {binaryDirection.toUpperCase()} - {
                  binaryExpiry >= 86400
                    ? `${Math.floor(binaryExpiry / 86400)}d`
                    : binaryExpiry >= 3600
                      ? `${Math.floor(binaryExpiry / 3600)}h`
                      : `${Math.floor(binaryExpiry / 60)}m`
                } expiry</span>}
              </div>
            </div>
          </>
        )}

        {/* Home Page with Banners and Stats */}
        {activePage === 'home' && (
          <HomePageContent />
        )}

        {activePage === 'orders' && (
          <div className="page-content orders-page">
            <div className="orders-header">
              <div>
                <h2>Orders</h2>
                <p className="subtitle" style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-muted)' }}>Manage your positions & history</p>
              </div>
              <div className="orders-filters">
                <div className="date-filter">
                  <label>From</label>
                  <input
                    type="date"
                    value={orderDateFrom}
                    onChange={(e) => setOrderDateFrom(e.target.value)}
                  />
                </div>
                <div className="date-filter">
                  <label>To</label>
                  <input
                    type="date"
                    value={orderDateTo}
                    onChange={(e) => setOrderDateTo(e.target.value)}
                  />
                </div>
                <button className="filter-btn ios-btn-secondary" onClick={() => { setOrderDateFrom(''); setOrderDateTo(''); }}>
                  Clear
                </button>
              </div>
            </div>

            <div className="orders-tabs">
              <button
                className={`orders-tab ${ordersActiveTab === 'open' ? 'active' : ''}`}
                onClick={() => setOrdersActiveTab('open')}
              >
                Open ({positions.length})
              </button>
              <button
                className={`orders-tab ${ordersActiveTab === 'pending' ? 'active' : ''}`}
                onClick={() => setOrdersActiveTab('pending')}
              >
                Pending ({pendingOrders.length})
              </button>
              <button
                className={`orders-tab ${ordersActiveTab === 'closed' ? 'active' : ''}`}
                onClick={() => setOrdersActiveTab('closed')}
              >
                History ({tradeHistory.length})
              </button>
              <button
                className={`orders-tab ${ordersActiveTab === 'cancelled' ? 'active' : ''}`}
                onClick={() => setOrdersActiveTab('cancelled')}
              >
                Cancelled ({cancelledOrders.length})
              </button>
            </div>

            {/* Open Positions Tab */}
            {ordersActiveTab === 'open' && (
              <div className="orders-section">
                <div className="section-header">
                  <h3>Open Positions</h3>
                  <div className="section-summary">
                    <span className={`total-pnl ${totalPnL >= 0 ? 'profit' : 'loss'}`}>
                      Total P/L: {totalPnL >= 0 ? '+' : ''}{displayCurrency === 'INR' ? '₹' : '$'}{(totalPnL * (displayCurrency === 'INR' ? usdInrRate : 1)).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="orders-table-container">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Open Time</th>
                        <th>Symbol</th>
                        <th>Type</th>
                        <th>Volume</th>
                        <th>Entry Price</th>
                        <th>Current Price</th>
                        <th>S/L</th>
                        <th>T/P</th>
                        <th>P/L</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.length === 0 ? (
                        <tr><td colSpan="11" className="no-data">No open positions</td></tr>
                      ) : (
                        filterOrdersByDate(positions).map((pos) => {
                          const livePrice = livePrices[pos.symbol];
                          const currentPrice = pos.side === 'buy'
                            ? (livePrice?.bid || pos.currentPrice || pos.entryPrice)
                            : (livePrice?.ask || pos.currentPrice || pos.entryPrice);
                          const priceDiff = pos.side === 'buy'
                            ? currentPrice - pos.entryPrice
                            : pos.entryPrice - currentPrice;
                          // Calculate profit based on symbol type (matching backend logic)
                          let profit = 0;
                          const sym = pos.symbol || '';
                          const vol = pos.volume || 0;
                          if (sym.includes('BTC') || sym.includes('ETH')) {
                            profit = priceDiff * vol; // Crypto: 1 lot = 1 unit
                          } else if (sym === 'XAUUSD' || sym === 'XAGUSD' || sym === 'XPTUSD') {
                            profit = priceDiff * vol * 100; // Gold/Silver: 1 lot = 100 oz
                          } else if (sym.includes('JPY')) {
                            profit = (priceDiff / 0.01) * vol * 1000; // JPY pairs
                          } else if (sym === 'US100' || sym === 'US2000' || sym === 'US30' || sym === 'US500') {
                            profit = priceDiff * vol; // Indices: $1 per point
                          } else {
                            profit = (priceDiff / 0.0001) * vol * 10; // Forex: $10 per pip
                          }

                          return (
                            <tr key={pos.tradeId || pos._id}>
                              <td className="order-id">{(pos.tradeId || pos._id || '').slice(-6)}</td>
                              <td>{new Date(pos.openTime || pos.createdAt).toLocaleString()}</td>
                              <td className="symbol-cell">{pos.symbol}</td>
                              <td className={`side-cell ${pos.side}`}>{pos.side?.toUpperCase()}</td>
                              <td>{pos.volume}</td>
                              <td>{formatPrice(pos.entryPrice, pos.symbol, true)}</td>
                              <td>{formatPrice(currentPrice, pos.symbol, true)}</td>
                              <td className="sl-cell">{pos.stopLoss || '-'}</td>
                              <td className="tp-cell">{pos.takeProfit || '-'}</td>
                              <td className={`pnl-cell ${profit >= 0 ? 'profit' : 'loss'}`}>
                                {profit >= 0 ? '+' : ''}{displayCurrency === 'INR' ? '₹' : '$'}{(profit * (displayCurrency === 'INR' ? usdInrRate : 1)).toFixed(2)}
                              </td>
                              <td className="actions-cell">
                                <button className="action-btn edit-btn" onClick={() => { setSelectedPosition(pos); setShowEditModal(true); }}>✏️</button>
                                <button className="action-btn close-btn" onClick={() => { setSelectedPosition(pos); setShowCloseModal(true); }}>✖️</button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pending Orders Tab */}
            {ordersActiveTab === 'pending' && (
              <div className="orders-section">
                <div className="section-header">
                  <h3>Pending Orders</h3>
                </div>
                <div className="orders-table-container">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Created</th>
                        <th>Symbol</th>
                        <th>Type</th>
                        <th>Volume</th>
                        <th>Entry Price</th>
                        <th>Current Price</th>
                        <th>S/L</th>
                        <th>T/P</th>
                        <th>Actions</th>
                      </tr>
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
                            <td>{formatPrice(livePrices[order.symbol]?.bid || order.entryPrice, order.symbol, true)}</td>
                            <td className="sl-cell">{order.stopLoss || '-'}</td>
                            <td className="tp-cell">{order.takeProfit || '-'}</td>
                            <td className="actions-cell">
                              <button className="action-btn cancel-btn" onClick={() => handleCancelOrder(order)}>Cancel</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Closed Positions Tab */}
            {ordersActiveTab === 'closed' && (
              <div className="orders-section">
                <div className="section-header">
                  <h3>Trade History</h3>
                  <div className="section-summary">
                    <span className={`total-pnl ${tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) >= 0 ? 'profit' : 'loss'}`}>
                      Total Realized P/L: {tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) >= 0 ? '+' : ''}
                      {displayCurrency === 'INR' ? '₹' : '$'}
                      {(tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) * (displayCurrency === 'INR' ? usdInrRate : 1)).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="orders-table-container">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Open Time</th>
                        <th>Close Time</th>
                        <th>Symbol</th>
                        <th>Type</th>
                        <th>Volume</th>
                        <th>Entry</th>
                        <th>Close</th>
                        <th>P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradeHistory.length === 0 ? (
                        <tr><td colSpan="9" className="no-data">No trade history</td></tr>
                      ) : (
                        filterOrdersByDate(tradeHistory).map((trade) => (
                          <tr key={trade.tradeId || trade._id}>
                            <td className="order-id">{(trade.tradeId || trade._id || '').slice(-6)}</td>
                            <td>{new Date(trade.openTime || trade.createdAt).toLocaleString()}</td>
                            <td>{trade.closeTime ? new Date(trade.closeTime).toLocaleString() : '-'}</td>
                            <td className="symbol-cell">{trade.symbol}</td>
                            <td className={`side-cell ${trade.side}`}>{trade.side?.toUpperCase()}</td>
                            <td>{trade.volume}</td>
                            <td>{formatPrice(trade.entryPrice, trade.symbol, true)}</td>
                            <td>{formatPrice(trade.closePrice || trade.entryPrice, trade.symbol, true)}</td>
                            <td className={`pnl-cell ${(trade.profit || 0) >= 0 ? 'profit' : 'loss'}`}>
                              {(trade.profit || 0) >= 0 ? '+' : ''}{displayCurrency === 'INR' ? '₹' : '$'}{((trade.profit || 0) * (displayCurrency === 'INR' ? usdInrRate : 1)).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cancelled Orders Tab */}
            {ordersActiveTab === 'cancelled' && (
              <div className="orders-section">
                <div className="section-header">
                  <h3>Cancelled Orders</h3>
                </div>
                <div className="orders-table-container">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Created</th>
                        <th>Cancelled</th>
                        <th>Symbol</th>
                        <th>Type</th>
                        <th>Volume</th>
                        <th>Entry Price</th>
                        <th>Reason</th>
                      </tr>
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
          </div>
        )}

        {activePage === 'wallet' && (
          <WalletPage user={user} />
        )}

        {activePage === 'business' && (
          <div className="page-content business-page">
            <div className="ios-page-header">
              <h1>📊 Business</h1>
              <p className="subtitle">Analytics & Performance</p>
            </div>

            <div className="business-stats-grid">
              <div className="business-stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-value">{displayCurrency === 'INR' ? '₹' : '$'}{((walletData?.balance || 0) * (displayCurrency === 'INR' ? usdInrRate : 1)).toFixed(2)}</div>
                <div className="stat-label">Total Balance</div>
              </div>
              <div className="business-stat-card">
                <div className="stat-icon">📈</div>
                <div className="stat-value">{tradeHistory.length}</div>
                <div className="stat-label">Total Trades</div>
              </div>
              <div className="business-stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-value">{tradeHistory.filter(t => (t.profit || 0) > 0).length}</div>
                <div className="stat-label">Winning Trades</div>
              </div>
              <div className="business-stat-card">
                <div className="stat-icon">❌</div>
                <div className="stat-value">{tradeHistory.filter(t => (t.profit || 0) < 0).length}</div>
                <div className="stat-label">Losing Trades</div>
              </div>
              <div className="business-stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-value" style={{ color: tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) >= 0 ? '+' : ''}
                  {displayCurrency === 'INR' ? '₹' : '$'}
                  {(tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) * (displayCurrency === 'INR' ? usdInrRate : 1)).toFixed(2)}
                </div>
                <div className="stat-label">Total P/L</div>
              </div>
              <div className="business-stat-card">
                <div className="stat-icon">🎯</div>
                <div className="stat-value">
                  {tradeHistory.length > 0 ? ((tradeHistory.filter(t => (t.profit || 0) > 0).length / tradeHistory.length) * 100).toFixed(1) : 0}%
                </div>
                <div className="stat-label">Win Rate</div>
              </div>
            </div>

            <div className="ios-card" style={{ margin: '0 24px 16px' }}>
              <div className="ios-card-header">
                <h3>Recent Activity</h3>
              </div>
              <div className="ios-card-content">
                {tradeHistory.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No trading activity yet
                  </div>
                ) : (
                  <div className="ios-list" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
                    {tradeHistory.slice(0, 5).map((trade, idx) => (
                      <div key={idx} className="ios-list-item">
                        <div className="icon" style={{ background: (trade.profit || 0) >= 0 ? 'var(--success)' : 'var(--danger)', color: 'white' }}>
                          {(trade.profit || 0) >= 0 ? '↑' : '↓'}
                        </div>
                        <div className="content">
                          <div className="title">{trade.symbol} - {trade.side?.toUpperCase()}</div>
                          <div className="subtitle">{new Date(trade.closeTime || trade.createdAt).toLocaleDateString()}</div>
                        </div>
                        <span style={{ fontWeight: 600, color: (trade.profit || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {(trade.profit || 0) >= 0 ? '+' : ''}{displayCurrency === 'INR' ? '₹' : '$'}{((trade.profit || 0) * (displayCurrency === 'INR' ? usdInrRate : 1)).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activePage === 'masters' && (
          <div className="page-content masters-page">
            <div className="ios-page-header">
              <h1>👑 Masters</h1>
              <p className="subtitle">Copy Trading & Top Traders</p>
            </div>

            <div className="masters-grid">
              <div className="master-card">
                <div className="master-header">
                  <div className="master-avatar">JT</div>
                  <div className="master-info">
                    <h3>John Trader</h3>
                    <span className="badge">Top Performer</span>
                  </div>
                </div>
                <div className="master-stats">
                  <div className="master-stat">
                    <div className="value" style={{ color: 'var(--success)' }}>+127%</div>
                    <div className="label">ROI</div>
                  </div>
                  <div className="master-stat">
                    <div className="value">1,234</div>
                    <div className="label">Copiers</div>
                  </div>
                  <div className="master-stat">
                    <div className="value">78%</div>
                    <div className="label">Win Rate</div>
                  </div>
                </div>
                <button className="copy-btn">Copy Trader</button>
              </div>

              <div className="master-card">
                <div className="master-header">
                  <div className="master-avatar">SK</div>
                  <div className="master-info">
                    <h3>Sarah Kim</h3>
                    <span className="badge">Verified</span>
                  </div>
                </div>
                <div className="master-stats">
                  <div className="master-stat">
                    <div className="value" style={{ color: 'var(--success)' }}>+89%</div>
                    <div className="label">ROI</div>
                  </div>
                  <div className="master-stat">
                    <div className="value">856</div>
                    <div className="label">Copiers</div>
                  </div>
                  <div className="master-stat">
                    <div className="value">72%</div>
                    <div className="label">Win Rate</div>
                  </div>
                </div>
                <button className="copy-btn">Copy Trader</button>
              </div>

              <div className="master-card">
                <div className="master-header">
                  <div className="master-avatar">MR</div>
                  <div className="master-info">
                    <h3>Mike Ross</h3>
                    <span className="badge">Rising Star</span>
                  </div>
                </div>
                <div className="master-stats">
                  <div className="master-stat">
                    <div className="value" style={{ color: 'var(--success)' }}>+156%</div>
                    <div className="label">ROI</div>
                  </div>
                  <div className="master-stat">
                    <div className="value">432</div>
                    <div className="label">Copiers</div>
                  </div>
                  <div className="master-stat">
                    <div className="value">81%</div>
                    <div className="label">Win Rate</div>
                  </div>
                </div>
                <button className="copy-btn">Copy Trader</button>
              </div>

              <div className="master-card">
                <div className="master-header">
                  <div className="master-avatar">AL</div>
                  <div className="master-info">
                    <h3>Alex Lee</h3>
                    <span className="badge">Consistent</span>
                  </div>
                </div>
                <div className="master-stats">
                  <div className="master-stat">
                    <div className="value" style={{ color: 'var(--success)' }}>+67%</div>
                    <div className="label">ROI</div>
                  </div>
                  <div className="master-stat">
                    <div className="value">678</div>
                    <div className="label">Copiers</div>
                  </div>
                  <div className="master-stat">
                    <div className="value">69%</div>
                    <div className="label">Win Rate</div>
                  </div>
                </div>
                <button className="copy-btn">Copy Trader</button>
              </div>
            </div>
          </div>
        )}

        {activePage === 'settings' && (
          <div className="page-content settings-page">
            <div className="settings-header">
              <h2>Account Settings</h2>
            </div>

            <div className="settings-grid">
              {/* Profile Section */}
              <div className="settings-card profile-card">
                <div className="card-header">
                  <h3>👤 Profile</h3>
                </div>
                <div className="profile-section">
                  <div className="avatar-section">
                    <div className="avatar-preview">
                      {user?.avatar ? (
                        <img src={`${API_URL}${user.avatar}`} alt="Profile" />
                      ) : (
                        <div className="avatar-placeholder">
                          {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      id="avatar-upload"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append('avatar', file);
                        try {
                          const token = localStorage.getItem('SetupFX-token');
                          const res = await fetch(`${API_URL}/api/auth/avatar`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData
                          });
                          const data = await res.json();
                          if (data.success) {
                            alert('Avatar updated!');
                            window.location.reload();
                          }
                        } catch (err) {
                          alert('Failed to upload avatar');
                        }
                      }}
                    />
                    <button
                      className="change-avatar-btn"
                      onClick={() => document.getElementById('avatar-upload').click()}
                    >
                      Change Photo
                    </button>
                  </div>
                  <div className="profile-info">
                    <div className="info-row">
                      <span className="label">User ID</span>
                      <span className="value">{user?.oderId || user?.id || '-'}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Name</span>
                      <span className="value">{user?.name || '-'}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Email</span>
                      <span className="value">{user?.email || '-'}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Phone</span>
                      <span className="value">{user?.phone || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Change Password */}
              <div className="settings-card">
                <div className="card-header">
                  <h3>🔒 Change Password</h3>
                </div>
                <form className="settings-form" onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target;
                  const currentPassword = form.currentPassword.value;
                  const newPassword = form.newPassword.value;
                  const confirmPassword = form.confirmPassword.value;

                  if (newPassword !== confirmPassword) {
                    alert('New passwords do not match');
                    return;
                  }

                  try {
                    const token = localStorage.getItem('SetupFX-token');
                    const res = await fetch(`${API_URL}/api/auth/change-password`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
                    });
                    const data = await res.json();
                    if (data.success) {
                      alert('Password changed successfully!');
                      localStorage.setItem('SetupFX-token', data.token);
                      form.reset();
                    } else {
                      alert(data.error || 'Failed to change password');
                    }
                  } catch (err) {
                    alert('Server error');
                  }
                }}>
                  <div className="form-group">
                    <label>Current Password</label>
                    <input type="password" name="currentPassword" required />
                  </div>
                  <div className="form-group">
                    <label>New Password</label>
                    <input type="password" name="newPassword" minLength="6" required />
                  </div>
                  <div className="form-group">
                    <label>Confirm New Password</label>
                    <input type="password" name="confirmPassword" minLength="6" required />
                  </div>
                  <button type="submit" className="save-btn">Update Password</button>
                </form>
              </div>

              {/* KYC Verification */}
              <div className="settings-card kyc-card">
                <div className="card-header">
                  <h3>🪪 KYC Verification</h3>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    background: kycStatus.status === 'approved' ? '#10b98120' : kycStatus.status === 'pending' ? '#f59e0b20' : kycStatus.status === 'rejected' ? '#ef444420' : '#64748b20',
                    color: kycStatus.status === 'approved' ? '#10b981' : kycStatus.status === 'pending' ? '#f59e0b' : kycStatus.status === 'rejected' ? '#ef4444' : '#64748b'
                  }}>
                    {kycStatus.status === 'not_submitted' ? 'Not Submitted' : kycStatus.status.charAt(0).toUpperCase() + kycStatus.status.slice(1)}
                  </span>
                </div>

                {kycStatus.status === 'approved' ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#10b981' }}>
                    <div style={{ fontSize: '48px', marginBottom: '10px' }}>✅</div>
                    <div style={{ fontSize: '18px', fontWeight: '600' }}>KYC Verified</div>
                    <div style={{ fontSize: '14px', color: '#888', marginTop: '8px' }}>
                      Your identity has been verified successfully.
                    </div>
                  </div>
                ) : kycStatus.status === 'pending' ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#f59e0b' }}>
                    <div style={{ fontSize: '48px', marginBottom: '10px' }}>⏳</div>
                    <div style={{ fontSize: '18px', fontWeight: '600' }}>Verification Pending</div>
                    <div style={{ fontSize: '14px', color: '#888', marginTop: '8px' }}>
                      Your documents are being reviewed. This usually takes 24-48 hours.
                    </div>
                  </div>
                ) : kycStatus.status === 'rejected' || kycStatus.status === 'resubmit' ? (
                  <div style={{ padding: '20px' }}>
                    <div style={{ textAlign: 'center', color: '#ef4444', marginBottom: '20px' }}>
                      <div style={{ fontSize: '48px', marginBottom: '10px' }}>❌</div>
                      <div style={{ fontSize: '18px', fontWeight: '600' }}>Verification {kycStatus.status === 'resubmit' ? 'Needs Resubmission' : 'Rejected'}</div>
                      {kycStatus.kyc?.rejectionReason && (
                        <div style={{ fontSize: '14px', color: '#888', marginTop: '8px', background: '#ef444410', padding: '10px', borderRadius: '8px' }}>
                          Reason: {kycStatus.kyc.rejectionReason}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setKycStatus({ status: 'not_submitted', kyc: null })} style={{ width: '100%', padding: '12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>
                      Submit New Documents
                    </button>
                  </div>
                ) : (
                  <form onSubmit={submitKyc} style={{ padding: '15px 0' }}>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#888' }}>Document Type *</label>
                      <select
                        value={kycForm.documentType}
                        onChange={(e) => setKycForm(prev => ({ ...prev, documentType: e.target.value }))}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a2e', color: '#fff' }}
                      >
                        <option value="aadhaar">Aadhaar Card</option>
                        <option value="pan">PAN Card</option>
                        <option value="passport">Passport</option>
                        <option value="driving_license">Driving License</option>
                        <option value="voter_id">Voter ID</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#888' }}>Full Name (as on document) *</label>
                      <input
                        type="text"
                        value={kycForm.fullName}
                        onChange={(e) => setKycForm(prev => ({ ...prev, fullName: e.target.value }))}
                        placeholder="Enter your full name"
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a2e', color: '#fff' }}
                        required
                      />
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#888' }}>Document Number *</label>
                      <input
                        type="text"
                        value={kycForm.documentNumber}
                        onChange={(e) => setKycForm(prev => ({ ...prev, documentNumber: e.target.value }))}
                        placeholder="Enter document number"
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a2e', color: '#fff' }}
                        required
                      />
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#888' }}>Address</label>
                      <textarea
                        value={kycForm.address}
                        onChange={(e) => setKycForm(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Enter your address"
                        rows="2"
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a2e', color: '#fff', resize: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#888' }}>Front Image *</label>
                        <div style={{ border: '2px dashed #333', borderRadius: '8px', padding: '15px', textAlign: 'center', cursor: 'pointer', background: kycForm.frontImage ? '#10b98110' : 'transparent' }}>
                          <input type="file" accept="image/*" onChange={handleKycImageUpload('frontImage')} style={{ display: 'none' }} id="kyc-front" />
                          <label htmlFor="kyc-front" style={{ cursor: 'pointer', color: kycForm.frontImage ? '#10b981' : '#888' }}>
                            {kycForm.frontImage ? '✓ Uploaded' : '📷 Upload'}
                          </label>
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#888' }}>Back Image</label>
                        <div style={{ border: '2px dashed #333', borderRadius: '8px', padding: '15px', textAlign: 'center', cursor: 'pointer', background: kycForm.backImage ? '#10b98110' : 'transparent' }}>
                          <input type="file" accept="image/*" onChange={handleKycImageUpload('backImage')} style={{ display: 'none' }} id="kyc-back" />
                          <label htmlFor="kyc-back" style={{ cursor: 'pointer', color: kycForm.backImage ? '#10b981' : '#888' }}>
                            {kycForm.backImage ? '✓ Uploaded' : '📷 Upload'}
                          </label>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#888' }}>Selfie with Document</label>
                      <div style={{ border: '2px dashed #333', borderRadius: '8px', padding: '15px', textAlign: 'center', cursor: 'pointer', background: kycForm.selfieImage ? '#10b98110' : 'transparent' }}>
                        <input type="file" accept="image/*" onChange={handleKycImageUpload('selfieImage')} style={{ display: 'none' }} id="kyc-selfie" />
                        <label htmlFor="kyc-selfie" style={{ cursor: 'pointer', color: kycForm.selfieImage ? '#10b981' : '#888' }}>
                          {kycForm.selfieImage ? '✓ Selfie Uploaded' : '🤳 Upload Selfie'}
                        </label>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={kycSubmitting}
                      style={{ width: '100%', padding: '12px', background: kycSubmitting ? '#666' : '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: kycSubmitting ? 'not-allowed' : 'pointer', fontWeight: '500' }}
                    >
                      {kycSubmitting ? 'Submitting...' : 'Submit KYC'}
                    </button>
                  </form>
                )}
              </div>

              {/* Account Stats */}
              <div className="settings-card">
                <div className="card-header">
                  <h3>📊 Trading Stats</h3>
                </div>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Total Trades</span>
                    <span className="stat-value">{walletData?.totalTrades || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Balance</span>
                    <span className="stat-value">${walletData?.balance?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Equity</span>
                    <span className="stat-value">${walletData?.equity?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Used Margin</span>
                    <span className="stat-value">${walletData?.margin?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>
              </div>

              {/* Logout */}
              <div className="settings-card">
                <div className="card-header">
                  <h3>🚪 Session</h3>
                </div>
                <button
                  className="logout-btn"
                  onClick={onLogout}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <footer className="status-bar">
        <div className="status-left">
          <span className="status-symbol">{selectedSymbol}</span>
          <span className={`market-status ${isMetaApiConnected ? 'connected' : 'disconnected'}`}>
            {isMetaApiConnected ? '🟢 Market Open' : '🔴 Market Closed'}
          </span>
          <span className="status-divider">|</span>
          <div className="status-currency-toggle">
            <button
              className={`status-curr-btn ${displayCurrency === 'USD' ? 'active' : ''}`}
              onClick={() => handleCurrencyChange('USD')}
            >$</button>
            <button
              className={`status-curr-btn ${displayCurrency === 'INR' ? 'active' : ''}`}
              onClick={() => handleCurrencyChange('INR')}
            >₹</button>
          </div>
          <span className="status-value">
            Bal: {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR'
              ? (Number(walletData.balance || 0) * (usdInrRate + usdMarkup)).toFixed(2)
              : Number(walletData.balance || 0).toFixed(2)}
          </span>
          <span className="status-divider">|</span>
          <span className="status-value">
            Credit: {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR'
              ? (Number(walletData.credit || 0) * (usdInrRate + usdMarkup)).toFixed(2)
              : Number(walletData.credit || 0).toFixed(2)}
          </span>
          <span className="status-divider">|</span>
          <span className="status-value">
            Eq: {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR'
              ? (Number(walletData.equity || 0) * (usdInrRate + usdMarkup)).toFixed(2)
              : Number(walletData.equity || 0).toFixed(2)}
          </span>
          <span className="status-divider">|</span>
          <span className="status-value">
            Margin: {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR'
              ? (Number(walletData.margin || 0) * (usdInrRate + usdMarkup)).toFixed(2)
              : Number(walletData.margin || 0).toFixed(2)}
          </span>
          <span className="status-divider">|</span>
          <span className={`status-value ${Number(walletData.freeMargin || 0) < 0 ? 'negative' : ''}`}>
            Free: {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR'
              ? (Number(walletData.freeMargin || 0) * (usdInrRate + usdMarkup)).toFixed(2)
              : Number(walletData.freeMargin || 0).toFixed(2)}
          </span>
          {Number(walletData.marginLevel || 0) > 0 && (
            <>
              <span className="status-divider">|</span>
              <span className={`margin-level ${Number(walletData.marginLevel || 0) < 100 ? 'warning' : ''}`}>
                Level: {Number(walletData.marginLevel || 0).toFixed(0)}%
              </span>
            </>
          )}
        </div>
        <div className="status-right">
          <span className="usd-rate">1 USD = ₹{(usdInrRate + usdMarkup).toFixed(2)}</span>
          <span>Positions: {positions.length}</span>
          <span className={`live-status ${isMetaApiConnected ? '' : 'offline'}`}>
            {isMetaApiConnected ? '● Live' : '○ Offline'}
          </span>
        </div>
      </footer>
    </div>
  );
}

// Protected Route Component
function ProtectedRoute({ children, isAuthenticated }) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Main App with Router
function AppRouter() {
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem('SetupFX-auth');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { isAuthenticated: false, user: null };
      }
    }
    return { isAuthenticated: false, user: null };
  });

  // Initialize theme on mount (before any component renders)
  useEffect(() => {
    const saved = localStorage.getItem('SetupFX-dark-mode');
    const isDark = saved === null ? true : saved === 'true';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, []);

  const handleLogin = (authData) => {
    setAuth(authData);
  };

  const handleLogout = async () => {
    // Play logout sound
    tradingSounds.playLogout();
    
    // Call logout API to log the activity with session duration
    try {
      const authData = JSON.parse(localStorage.getItem('SetupFX-auth') || '{}');
      if (authData.token) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authData.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sessionId: authData.user?.sessionId })
        });
      }
    } catch (error) {
      console.error('Logout API error:', error);
    }
    
    localStorage.removeItem('SetupFX-auth');
    setAuth({ isAuthenticated: false, user: null });
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/landing" element={<NewLandingPage />} />
        <Route path="/login" element={
          auth.isAuthenticated ? <Navigate to="/app/market" replace /> : <Login onLogin={handleLogin} />
        } />
        <Route path="/register" element={
          auth.isAuthenticated ? <Navigate to="/app/market" replace /> : <Register onLogin={handleLogin} />
        } />
        <Route path="/forgot-password" element={
          auth.isAuthenticated ? <Navigate to="/app/market" replace /> : <ForgotPassword />
        } />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/risk-disclaimer" element={<RiskDisclaimer />} />
        <Route path="/subadmin" element={<SubAdminLogin />} />
        <Route path="/broker" element={<BrokerLogin />} />
        
        {/* Sub-Admin Panel */}
        <Route path="/subadmin-panel" element={<SubAdminLayout />}>
          <Route index element={<SubAdminDashboard />} />
          <Route path="market-watch" element={<MarketWatch adminType="subadmin" />} />
          <Route path="users" element={<SubAdminUsers />} />
          <Route path="brokers" element={<SubAdminBrokers />} />
          <Route path="trades" element={<SubAdminTrades />} />
          <Route path="funds" element={<SubAdminFunds />} />
          <Route path="broker-funds" element={<SubAdminBrokerFunds />} />
          <Route path="bank-management" element={<SubAdminBankManagement />} />
          <Route path="pnl-sharing" element={<SubAdminPnlSharing />} />
          <Route path="wallet" element={<SubAdminWallet />} />
          <Route path="settings" element={<SubAdminSettings />} />
        </Route>
        
        {/* Broker Panel */}
        <Route path="/broker-panel" element={<BrokerLayout />}>
          <Route index element={<BrokerDashboard />} />
          <Route path="market-watch" element={<MarketWatch adminType="broker" />} />
          <Route path="users" element={<BrokerUsers />} />
          <Route path="trades" element={<BrokerTrades />} />
          <Route path="funds" element={<BrokerFunds />} />
          <Route path="pnl-sharing" element={<BrokerPnlSharing />} />
          <Route path="bank-management" element={<BrokerBankManagement />} />
          <Route path="wallet" element={<BrokerWallet />} />
          <Route path="settings" element={<BrokerSettings />} />
        </Route>
        
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="market-watch" element={<MarketWatch adminType="admin" />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="users/:tab" element={<UserManagement />} />
          <Route path="trades" element={<TradeManagement />} />
          <Route path="trades/:tab" element={<TradeManagement />} />
          <Route path="funds" element={<FundManagement />} />
          <Route path="funds/:tab" element={<FundManagement />} />
          <Route path="charges" element={<ChargeManagement />} />
          <Route path="charges/:tab" element={<ChargeManagement />} />
          <Route path="admins" element={<AdminManagement />} />
          <Route path="admins/:tab" element={<AdminManagement />} />
          <Route path="brand" element={<BrandManagement />} />
          <Route path="brand/:tab" element={<BrandManagement />} />
          <Route path="ib" element={<IBManagement />} />
          <Route path="ib/:tab" element={<IBManagement />} />
          <Route path="copy-trade" element={<CopyTradeManagement />} />
          <Route path="copy-trade/:tab" element={<CopyTradeManagement />} />
          <Route path="demo-settings" element={<DemoSettings />} />
          <Route path="binary-settings" element={<BinarySettings />} />
          <Route path="segments/*" element={<Navigate to="/admin" replace />} />
          <Route path="risk-management" element={<RiskManagement />} />
          <Route path="hedging-segments" element={<HedgingSegmentSettings />} />
          <Route path="hedging-segments/:tab" element={<HedgingSegmentSettings />} />
          <Route path="netting-segments" element={<NettingSegmentSettings />} />
          <Route path="netting-segments/:tab" element={<NettingSegmentSettings />} />
          <Route path="reboorder" element={<ReboorderSettings />} />
          <Route path="pnl-sharing" element={<PnlSharing />} />
          <Route path="zerodha" element={<ZerodhaConnect />} />
          <Route path="market-control" element={<MarketControl />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:tab" element={<Reports />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="notifications/:tab" element={<Notifications />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/:tab" element={<Settings />} />
        </Route>
        {/* Landing page at root */}
        <Route path="/" element={<NewLandingPage />} />
        {/* User App - requires authentication with nested routes */}
        <Route path="/app" element={
          auth.isAuthenticated
            ? <UserLayout user={auth.user} onLogout={handleLogout} />
            : <Navigate to="/login" replace />
        }>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="wallet" element={<UserWalletPage />} />
          <Route path="business" element={<BusinessPage />} />
          <Route path="masters" element={<MastersPage />} />
          <Route path="settings" element={<UserSettingsPage />} />
        </Route>
        {/* Fallback */}
        <Route path="/*" element={<NewLandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;
