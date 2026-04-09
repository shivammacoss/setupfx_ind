import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function WalletPage() {
  const { user, walletData, usdInrRate, usdMarkup, positions = [] } = useOutletContext();

  const [activeTab, setActiveTab] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD'); // USD or INR
  const [paymentMethod, setPaymentMethod] = useState('');
  const [proofImage, setProofImage] = useState('');
  const [transactionId, setTransactionId] = useState(''); // Transaction ID for deposits
  const [withdrawDetails, setWithdrawDetails] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState({ bankAccounts: [], upiIds: [], cryptoWallets: [] });
  const [userWallet, setUserWallet] = useState({ balance: 0, credit: 0, equity: 0, margin: 0, freeMargin: 0 });
  const [walletUSD, setWalletUSD] = useState({ balance: 0, totalDeposits: 0, totalWithdrawals: 0 });
  const [walletINR, setWalletINR] = useState({ balance: 0, totalDeposits: 0, totalWithdrawals: 0 });
  const [allowedCurrencies, setAllowedCurrencies] = useState({ USD: true, INR: true });
  const [exchangeRate, setExchangeRate] = useState({ USD_TO_INR: 83.50, INR_TO_USD: 1/83.50 });
  const [uploadedHashes, setUploadedHashes] = useState([]);
  const [withdrawMethod, setWithdrawMethod] = useState('bank');
  const [withdrawBankDetails, setWithdrawBankDetails] = useState({
    bankName: '', accountNumber: '', ifsc: '', accountHolder: ''
  });
  const [withdrawUpiDetails, setWithdrawUpiDetails] = useState({ upiId: '', name: '' });
  const [withdrawCryptoDetails, setWithdrawCryptoDetails] = useState({ network: '', address: '' });
  
  // Saved bank details from user settings
  const [savedBankAccounts, setSavedBankAccounts] = useState([]);
  const [selectedSavedBank, setSelectedSavedBank] = useState('');
  
  // Saved UPI details from user settings
  const [savedUpiAccounts, setSavedUpiAccounts] = useState([]);
  const [selectedSavedUpi, setSelectedSavedUpi] = useState('');

  // Eligible bonus hint
  const [bonusHint, setBonusHint] = useState(null);
  const bonusTimerRef = useRef(null);

  // Fetch wallet from server - use direct user wallet endpoint
  const fetchWalletFromServer = async () => {
    const userId = user?.oderId || user?.id;
    if (!userId) return;
    try {
      // Use the direct user wallet endpoint that reads from User.wallet
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
        // Set multi-currency wallets
        if (data.walletUSD) setWalletUSD(data.walletUSD);
        if (data.walletINR) setWalletINR(data.walletINR);
        if (data.allowedCurrencies) setAllowedCurrencies(data.allowedCurrencies);
      }
      
      // Fetch exchange rate
      const rateRes = await fetch(`${API_URL}/api/exchange-rate`);
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        if (rateData.success) {
          setExchangeRate(rateData.rates);
        }
      }
    } catch (error) {
      // Silent fail - wallet will show 0
    }
  };

  // Fetch transactions from server
  const fetchTransactionsFromServer = async () => {
    const userId = user?.oderId || user?.id;
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
    fetchWalletFromServer();
    fetchTransactionsFromServer();

    // Load payment details from user's parent admin (broker/subadmin) or fallback to superadmin
    const loadPaymentMethods = async () => {
      try {
        const userId = user?.oderId || user?.id;
        const endpoint = userId 
          ? `${API_URL}/api/admin-payment-details/for-user/${userId}`
          : `${API_URL}/api/admin-payment-details`;
        
        const response = await fetch(endpoint);
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
      } catch (error) {
        console.error('Error loading payment methods:', error);
      }
    };
    loadPaymentMethods();

    const hashes = JSON.parse(localStorage.getItem('SetupFX-uploaded-hashes') || '[]');
    setUploadedHashes(hashes);

    // Fetch user's saved bank accounts
    const loadSavedBankAccounts = async () => {
      try {
        const userId = user?.oderId || user?.id;
        if (!userId) return;
        const response = await fetch(`${API_URL}/api/user/bank-accounts/${userId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.bankAccounts) {
            setSavedBankAccounts(data.bankAccounts);
          }
        }
      } catch (error) {
        console.error('Error loading saved bank accounts:', error);
      }
    };
    loadSavedBankAccounts();
    
    // Fetch user's saved UPI accounts
    const loadSavedUpiAccounts = async () => {
      try {
        const userId = user?.oderId || user?.id;
        if (!userId) return;
        const response = await fetch(`${API_URL}/api/user/upi-accounts/${userId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.upiAccounts) {
            setSavedUpiAccounts(data.upiAccounts);
          }
        }
      } catch (error) {
        console.error('Error loading saved UPI accounts:', error);
      }
    };
    loadSavedUpiAccounts();

    const walletInterval = setInterval(fetchWalletFromServer, 5000);
    return () => clearInterval(walletInterval);
  }, [user]);

  // Debounced eligible-bonus check for deposit form
  useEffect(() => {
    if (bonusTimerRef.current) clearTimeout(bonusTimerRef.current);
    if (activeTab !== 'deposit' || !amount || parseFloat(amount) <= 0) {
      setBonusHint(null);
      return;
    }
    const userId = user?.oderId || user?.id;
    if (!userId) return;
    const inrAmount = currency === 'INR' ? parseFloat(amount) : parseFloat(amount) * (exchangeRate.USD_TO_INR || 83);
    bonusTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/user/eligible-bonus?userId=${userId}&amount=${inrAmount}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) setBonusHint(data);
          else setBonusHint(null);
        }
      } catch { setBonusHint(null); }
    }, 300);
    return () => { if (bonusTimerRef.current) clearTimeout(bonusTimerRef.current); };
  }, [amount, currency, activeTab, user]);

  // Generate hash for duplicate detection
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
    if (activeTab === 'deposit' && !paymentMethod) {
      alert('Please select a payment method');
      return;
    }
    if (activeTab === 'deposit' && !proofImage) {
      alert('Please upload payment proof screenshot');
      return;
    }
    if (activeTab === 'withdrawal') {
      const maxWithdrawable = Math.max(0, Number(displayFreeMargin) || 0);
      if (parseFloat(amount) > maxWithdrawable) {
        alert(`You can only withdraw up to ${currency === 'INR' ? '₹' + toInr(maxWithdrawable) : '$' + maxWithdrawable.toFixed(2)} (Free Margin).${displayMargin > 0 ? ' You have active trades using margin.' : ''}`);
        return;
      }
      if (withdrawMethod === 'bank' || withdrawMethod === 'upi') {
        if (!withdrawBankDetails.bankName || !withdrawBankDetails.accountNumber || !withdrawBankDetails.ifsc || !withdrawBankDetails.accountHolder) {
          alert('Please fill all bank details');
          return;
        }
      } else if (withdrawMethod === 'crypto') {
        if (!withdrawCryptoDetails.network || !withdrawCryptoDetails.address) {
          alert('Please fill crypto wallet details');
          return;
        }
      }
    }

    if (proofImage) {
      const hash = await generateHash(proofImage);
      const updatedHashes = [...uploadedHashes, hash];
      setUploadedHashes(updatedHashes);
      localStorage.setItem('SetupFX-uploaded-hashes', JSON.stringify(updatedHashes));
    }

    // Build withdrawal details object
    let withdrawalInfo = null;
    if (activeTab === 'withdrawal') {
      withdrawalInfo = {
        method: withdrawMethod,
        ...((withdrawMethod === 'bank' || withdrawMethod === 'upi') && { bankDetails: withdrawBankDetails }),
        ...(withdrawMethod === 'crypto' && { cryptoDetails: withdrawCryptoDetails })
      };
    }

    const newRequest = {
      id: Date.now().toString(),
      oderId: user?.oderId,
      userId: user?.id,
      userName: user?.name || 'User',
      type: activeTab,
      amount: parseFloat(amount),
      currency: currency, // USD or INR
      method: activeTab === 'deposit' ? paymentMethod : withdrawMethod,
      proofImage: activeTab === 'deposit' ? proofImage : null,
      transactionId: activeTab === 'deposit' ? transactionId : null,
      withdrawalInfo: withdrawalInfo,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    // For withdrawal, set paymentMethod to withdrawMethod for consistency
    if (activeTab === 'withdrawal') {
      setPaymentMethod(withdrawMethod);
    }

    try {
      const response = await fetch(`${API_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRequest)
      });
      if (response.ok) {
        setTransactions([...transactions, newRequest]);
      }
    } catch (error) {
      const requests = JSON.parse(localStorage.getItem('SetupFX-fund-requests') || '[]');
      requests.push(newRequest);
      localStorage.setItem('SetupFX-fund-requests', JSON.stringify(requests));
      setTransactions([...transactions, newRequest]);
    }

    setAmount('');
    setPaymentMethod('');
    setProofImage('');
    setTransactionId('');
    setWithdrawDetails('');
    setWithdrawBankDetails({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '' });
    setWithdrawUpiDetails({ upiId: '', name: '' });
    setWithdrawCryptoDetails({ network: '', address: '' });
    setSelectedSavedBank('');
    setSelectedSavedUpi('');
    alert(`${activeTab === 'deposit' ? 'Deposit' : 'Withdrawal'} request submitted successfully!`);
  };

  const getMethodDetails = (methodId) => {
    const bank = paymentMethods.bankAccounts.find(b => b._id === methodId);
    if (bank) return { type: 'bank', data: bank };
    const upi = paymentMethods.upiIds.find(u => u._id === methodId);
    if (upi) return { type: 'upi', data: upi };
    const crypto = paymentMethods.cryptoWallets.find(c => c._id === methodId);
    if (crypto) return { type: 'crypto', data: crypto };
    return null;
  };

  const selectedMethod = paymentMethod ? getMethodDetails(paymentMethod) : null;
  const effectiveRate = usdInrRate + usdMarkup;
  const toInr = (usd) => (usd * effectiveRate).toFixed(2);

  /** Same source as footer status bar: balance from API, margin/equity/free from UserLayout (positions). */
  const displayBalance = Number(walletData?.balance) || Number(userWallet.balance) || 0;
  const displayCredit = Number(walletData?.credit) || Number(userWallet.credit) || 0;
  const layoutMetricsTrust =
    Number(walletData?.balance) > 0 ||
    (Array.isArray(positions) && positions.length > 0) ||
    Number(walletData?.margin) > 0;

  let displayEquity;
  let displayMargin;
  let displayFreeMargin;
  if (layoutMetricsTrust) {
    displayMargin = Number(walletData?.margin) || 0;
    displayEquity = Number(walletData?.equity);
    if (!Number.isFinite(displayEquity)) displayEquity = displayBalance + displayCredit;
    displayFreeMargin = Number(walletData?.freeMargin);
    if (!Number.isFinite(displayFreeMargin)) displayFreeMargin = Math.max(0, displayEquity - displayMargin);
  } else {
    displayMargin = Number(userWallet.margin) || 0;
    displayEquity = Number(userWallet.equity) || displayBalance + displayCredit;
    displayFreeMargin =
      Number(userWallet.freeMargin) || Math.max(0, displayEquity - displayMargin);
  }

  const scrollToWalletForm = () => {
    document.querySelector('.wallet-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="wallet-page">
      <div className="mobi-wallet-mobile-hero">
        <div className="mobi-wallet-hero">
          <div className="mobi-wallet-title">Wallet</div>
          <div className="mobi-curr-toggle">
            {allowedCurrencies.USD && (
              <button
                type="button"
                className={currency === 'USD' ? 'mobi-active' : ''}
                onClick={() => setCurrency('USD')}
              >
                USD
              </button>
            )}
            {allowedCurrencies.INR && (
              <button
                type="button"
                className={currency === 'INR' ? 'mobi-active' : ''}
                onClick={() => setCurrency('INR')}
              >
                INR
              </button>
            )}
          </div>
          <div className="mobi-balance-card">
            <div className="mobi-pc-label">{currency === 'INR' ? 'Balance (INR)' : 'Balance (USD)'}</div>
            <div className="mobi-pc-amount">
              {currency === 'INR'
                ? `₹${toInr(Number(displayBalance || 0))}`
                : `$${Number(displayBalance || 0).toFixed(2)}`}
            </div>
            <div className="mobi-pc-sub">
              1 USD = ₹{effectiveRate.toFixed(2)}
              {usdMarkup > 0 && ` · +₹${usdMarkup} markup`}
            </div>
            <div className="mobi-pc-row">
              <div>
                <div className="mobi-pc-stat-label">Equity</div>
                <div className="mobi-pc-stat-val">
                  {currency === 'INR'
                    ? `₹${toInr(Number(displayEquity || 0))}`
                    : `$${Number(displayEquity || 0).toFixed(2)}`}
                </div>
              </div>
              <div>
                <div className="mobi-pc-stat-label">Free</div>
                <div className="mobi-pc-stat-val">
                  {currency === 'INR'
                    ? `₹${toInr(Number(displayFreeMargin || 0))}`
                    : `$${Number(displayFreeMargin || 0).toFixed(2)}`}
                </div>
              </div>
              <div>
                <div className="mobi-pc-stat-label">Margin</div>
                <div className="mobi-pc-stat-val">
                  {currency === 'INR'
                    ? `₹${toInr(Number(displayMargin || 0))}`
                    : `$${Number(displayMargin || 0).toFixed(2)}`}
                </div>
              </div>
            </div>
          </div>
          {!user?.isDemo && (
            <div className="mobi-wallet-actions">
              <button
                type="button"
                className="mobi-wa-deposit"
                onClick={() => {
                  setActiveTab('deposit');
                  scrollToWalletForm();
                }}
              >
                Deposit
              </button>
              <button
                type="button"
                className="mobi-wa-withdraw"
                onClick={() => {
                  setActiveTab('withdrawal');
                  scrollToWalletForm();
                }}
              >
                Withdraw
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="currency-rate-bar">
        <span className="rate-label">USD/INR Rate:</span>
        <span className="rate-live">₹{usdInrRate.toFixed(2)} (Live)</span>
        {usdMarkup > 0 && <span className="rate-markup">+ ₹{usdMarkup} markup</span>}
        <span className="rate-effective">= ₹{effectiveRate.toFixed(2)}</span>
      </div>

      <div className="wallet-balance-card">
        <h2>My Wallet</h2>
        <div className="balance-row">
          <span className="currency-label">USD</span>
          <div className="balance-grid">
            <div className="balance-item"><span className="balance-label">Balance</span><span className="balance-value">${Number(displayBalance || 0).toFixed(2)}</span></div>
            <div className="balance-item"><span className="balance-label">Credit</span><span className="balance-value">${Number(displayCredit || 0).toFixed(2)}</span></div>
            <div className="balance-item"><span className="balance-label">Equity</span><span className="balance-value">${Number(displayEquity || 0).toFixed(2)}</span></div>
            <div className="balance-item"><span className="balance-label">Margin</span><span className="balance-value">${Number(displayMargin || 0).toFixed(2)}</span></div>
            <div className="balance-item highlight"><span className="balance-label">Free Margin</span><span className="balance-value">${Number(displayFreeMargin || 0).toFixed(2)}</span></div>
          </div>
        </div>
        <div className="balance-row inr">
          <span className="currency-label">INR</span>
          <div className="balance-grid">
            <div className="balance-item"><span className="balance-label">Balance</span><span className="balance-value">₹{toInr(Number(displayBalance || 0))}</span></div>
            <div className="balance-item"><span className="balance-label">Credit</span><span className="balance-value">₹{toInr(Number(displayCredit || 0))}</span></div>
            <div className="balance-item"><span className="balance-label">Equity</span><span className="balance-value">₹{toInr(Number(displayEquity || 0))}</span></div>
            <div className="balance-item"><span className="balance-label">Margin</span><span className="balance-value">₹{toInr(Number(displayMargin || 0))}</span></div>
            <div className="balance-item highlight-inr"><span className="balance-label">Free Margin</span><span className="balance-value">₹{toInr(Number(displayFreeMargin || 0))}</span></div>
          </div>
        </div>
      </div>

      <div className="wallet-content">
        <div className="wallet-form-card">
          {/* Demo Account Restriction */}
          {user?.isDemo && (
            <div className="wallet-demo-banner">
              <h3 className="wallet-demo-title">Demo Account</h3>
              <p className="wallet-demo-desc">
                Deposit and withdrawal are not available for demo accounts.<br/>
                Convert to a real account to access these features.
              </p>
              <button
                className="wallet-demo-convert-btn"
                onClick={async () => {
                  if (!confirm('Convert to real account? Your wallet will be reset to zero.')) return;
                  try {
                    const token = localStorage.getItem('SetupFX-token');
                    const res = await fetch(`${API_URL}/api/auth/convert-to-real`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
                    });
                    const data = await res.json();
                    if (data.success) {
                      alert('Account converted successfully! Please login again.');
                      localStorage.removeItem('SetupFX-token');
                      localStorage.removeItem('SetupFX-user');
                      window.location.href = '/login';
                    } else {
                      alert(data.error || 'Failed to convert account');
                    }
                  } catch (err) {
                    alert('Error converting account');
                  }
                }}
              >
                Convert to Real Account
              </button>
              <p style={{ color: 'var(--text-muted)', margin: '10px 0 0', fontSize: '11px' }}>
                Demo expires: {user?.demoExpiresAt ? new Date(user.demoExpiresAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          )}

          {!user?.isDemo && (
            <>
          <div className="wallet-tabs">
            <button className={`wallet-tab ${activeTab === 'deposit' ? 'active' : ''}`} onClick={() => setActiveTab('deposit')}>Deposit</button>
            <button className={`wallet-tab ${activeTab === 'withdrawal' ? 'active' : ''}`} onClick={() => setActiveTab('withdrawal')}>Withdrawal</button>
          </div>

          <div className="wallet-form">
            {/* Currency Selection */}
            <div className="form-group">
              <label>Select Currency</label>
              <div className="currency-toggle" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {allowedCurrencies.USD && (
                  <button
                    type="button"
                    className={`currency-btn ${currency === 'USD' ? 'active' : ''}`}
                    onClick={() => setCurrency('USD')}
                  >
                    $ USD
                  </button>
                )}
                {allowedCurrencies.INR && (
                  <button
                    type="button"
                    className={`currency-btn ${currency === 'INR' ? 'active' : ''}`}
                    onClick={() => setCurrency('INR')}
                  >
                    ₹ INR
                  </button>
                )}
              </div>
              {/* Show balances */}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                {allowedCurrencies.USD && <span>USD Balance: ${walletUSD.balance?.toFixed(2) || '0.00'}</span>}
                {allowedCurrencies.INR && <span>INR Balance: ₹{walletINR.balance?.toFixed(2) || '0.00'}</span>}
              </div>
            </div>

            {activeTab === 'withdrawal' && (
              <div className="wallet-info-strip" style={{ borderLeft: `3px solid ${displayMargin > 0 ? 'var(--warning)' : 'var(--success)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Available for Withdrawal</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: displayMargin > 0 ? '#f59e0b' : '#10b981' }}>
                    {currency === 'INR'
                      ? `₹${toInr(Math.max(0, Number(displayFreeMargin) || 0))}`
                      : `$${Math.max(0, Number(displayFreeMargin) || 0).toFixed(2)}`}
                  </span>
                </div>
                {displayMargin > 0 && (
                  <div style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⚠️</span>
                    <span>You have active trades. Only free margin (Balance − Used Margin) can be withdrawn.</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
                  <span>Balance: {currency === 'INR' ? `₹${toInr(displayBalance || 0)}` : `$${(displayBalance || 0).toFixed(2)}`}</span>
                  <span>Margin Used: {currency === 'INR' ? `₹${toInr(displayMargin || 0)}` : `$${(displayMargin || 0).toFixed(2)}`}</span>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Amount ({currency === 'USD' ? '$' : '₹'})</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={activeTab === 'withdrawal'
                  ? `Max: ${currency === 'INR' ? '₹' + toInr(Math.max(0, Number(displayFreeMargin) || 0)) : '$' + Math.max(0, Number(displayFreeMargin) || 0).toFixed(2)}`
                  : `Enter amount in ${currency}`}
                min="1"
                max={activeTab === 'withdrawal' ? Math.max(0, Number(displayFreeMargin) || 0) : undefined}
              />
              {activeTab === 'withdrawal' && amount && parseFloat(amount) > (Number(displayFreeMargin) || 0) && (
                <p style={{ fontSize: 12, color: '#ef4444', margin: '4px 0 0', fontWeight: 500 }}>
                  ⚠ Amount exceeds available free margin ({currency === 'INR' ? `₹${toInr(displayFreeMargin || 0)}` : `$${(displayFreeMargin || 0).toFixed(2)}`})
                </p>
              )}
              {amount && currency === 'USD' && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  ≈ ₹{(parseFloat(amount) * exchangeRate.USD_TO_INR).toFixed(2)} INR
                </p>
              )}
              {amount && currency === 'INR' && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  ≈ ${(parseFloat(amount) * exchangeRate.INR_TO_USD).toFixed(2)} USD
                </p>
              )}
              {activeTab === 'deposit' && bonusHint && bonusHint.bonus > 0 && (
                <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: '#fef9c3', border: '1px solid #fde047', color: '#854d0e', fontSize: 13, fontWeight: 500 }}>
                  🎁 You'll receive a bonus of ₹{bonusHint.bonus.toFixed(0)} ({bonusHint.templateName})
                </div>
              )}
              {activeTab === 'deposit' && bonusHint && bonusHint.belowMinimum && (
                <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-secondary, #f3f4f6)', border: '1px solid var(--border, #e5e7eb)', color: 'var(--text-secondary)', fontSize: 13 }}>
                  Deposit at least ₹{bonusHint.minimumRequired} to qualify for a bonus
                </div>
              )}
            </div>

            {activeTab === 'deposit' && (
              <div className="form-group">
                <label>Payment Method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="">Select payment method</option>
                  {paymentMethods.bankAccounts.length > 0 && (
                    <optgroup label="Bank Transfer">
                      {paymentMethods.bankAccounts.map(bank => (
                        <option key={bank._id} value={bank._id}>
                          {bank.bankName} - ****{bank.accountNumber?.slice(-4)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {paymentMethods.upiIds.length > 0 && (
                    <optgroup label="UPI">
                      {paymentMethods.upiIds.map(upi => (
                        <option key={upi._id} value={upi._id}>
                          {upi.name} - {upi.upiId}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {paymentMethods.cryptoWallets.length > 0 && (
                    <optgroup label="Crypto">
                      {paymentMethods.cryptoWallets.map(crypto => (
                        <option key={crypto._id} value={crypto._id}>
                          {crypto.network} - {crypto.address?.slice(0, 10)}...
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

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
                    {selectedMethod.data.qrImage && <img src={selectedMethod.data.qrImage} alt="QR" className="payment-qr" />}
                  </>
                )}
                {selectedMethod.type === 'crypto' && (
                  <>
                    <p><strong>Network:</strong> {selectedMethod.data.network}</p>
                    <p className="crypto-address"><strong>Address:</strong> {selectedMethod.data.address}</p>
                    {selectedMethod.data.qrImage && <img src={selectedMethod.data.qrImage} alt="QR" className="payment-qr" />}
                  </>
                )}
              </div>
            )}

            {activeTab === 'deposit' && (
              <>
                <div className="form-group">
                  <label>Transaction ID / UTR Number</label>
                  <input 
                    type="text" 
                    value={transactionId} 
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="Enter transaction ID or UTR number"
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  />
                  <small style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Optional: Enter the transaction reference for faster verification</small>
                </div>
                <div className="form-group">
                  <label>Upload Payment Proof *</label>
                  <div className="proof-upload-area">
                    <input type="file" id="proof-upload" accept="image/*" onChange={handleProofUpload} className="file-input" />
                    <label htmlFor="proof-upload" className="upload-label">
                      {proofImage ? (
                        <img src={proofImage} alt="Proof" className="proof-preview" />
                      ) : (
                        <div className="upload-placeholder"><span>📷</span><span>Upload Screenshot</span></div>
                      )}
                    </label>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'withdrawal' && (
              <div className="withdrawal-details-section">
                <div className="form-group">
                  <label>Withdrawal Method</label>
                  <div className="withdraw-method-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <button type="button" className={`method-tab ${withdrawMethod === 'bank' ? 'active' : ''}`} 
                      onClick={() => setWithdrawMethod('bank')}
                      style={{ flex: 1, padding: '10px', borderRadius: 8, border: withdrawMethod === 'bank' ? '2px solid var(--primary)' : '1px solid var(--border)', background: withdrawMethod === 'bank' ? 'var(--primary-light)' : 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px' }}>
                      🏦 Bank Transfer
                    </button>
                    <button type="button" className={`method-tab ${withdrawMethod === 'upi' ? 'active' : ''}`}
                      onClick={() => setWithdrawMethod('upi')}
                      style={{ flex: 1, padding: '10px', borderRadius: 8, border: withdrawMethod === 'upi' ? '2px solid var(--primary)' : '1px solid var(--border)', background: withdrawMethod === 'upi' ? 'var(--primary-light)' : 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px' }}>
                      📱 UPI
                    </button>
                    <button type="button" className={`method-tab ${withdrawMethod === 'crypto' ? 'active' : ''}`}
                      onClick={() => setWithdrawMethod('crypto')}
                      style={{ flex: 1, padding: '10px', borderRadius: 8, border: withdrawMethod === 'crypto' ? '2px solid var(--primary)' : '1px solid var(--border)', background: withdrawMethod === 'crypto' ? 'var(--primary-light)' : 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px' }}>
                      ₿ Crypto
                    </button>
                  </div>
                </div>

                {(withdrawMethod === 'bank' || withdrawMethod === 'upi') && (
                  <div className="bank-details-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Saved Bank Accounts Selection */}
                    {savedBankAccounts.length > 0 && (
                      <div className="form-group">
                        <label>Select Saved Bank Account</label>
                        <select 
                          value={selectedSavedBank}
                          onChange={(e) => {
                            const bankId = e.target.value;
                            setSelectedSavedBank(bankId);
                            if (bankId) {
                              const bank = savedBankAccounts.find(b => b._id === bankId);
                              if (bank) {
                                setWithdrawBankDetails({
                                  bankName: bank.bankName,
                                  accountNumber: bank.accountNumber,
                                  ifsc: bank.ifsc,
                                  accountHolder: bank.accountHolder,
                                  upiId: bank.upiId || ''
                                });
                                // Also set UPI details if available
                                if (bank.upiId) {
                                  setWithdrawUpiDetails({
                                    upiId: bank.upiId,
                                    name: bank.accountHolder
                                  });
                                }
                              }
                            } else {
                              setWithdrawBankDetails({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', upiId: '' });
                              setWithdrawUpiDetails({ upiId: '', name: '' });
                            }
                          }}
                          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        >
                          <option value="">-- Enter manually or select saved --</option>
                          {savedBankAccounts.map(bank => (
                            <option key={bank._id} value={bank._id}>
                              {bank.bankName} - ****{bank.accountNumber?.slice(-4)} ({bank.accountHolder}) {bank.upiId ? `📱 ${bank.upiId}` : ''}
                            </option>
                          ))}
                        </select>
                        <small style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Add bank accounts in Settings → Bank Details</small>
                      </div>
                    )}
                    
                    <div className="form-group">
                      <label>Bank Name *</label>
                      <input type="text" value={withdrawBankDetails.bankName} 
                        onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, bankName: e.target.value }))}
                        placeholder="Enter bank name" />
                    </div>
                    <div className="form-group">
                      <label>Account Holder Name *</label>
                      <input type="text" value={withdrawBankDetails.accountHolder}
                        onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, accountHolder: e.target.value }))}
                        placeholder="Enter account holder name" />
                    </div>
                    <div className="form-group">
                      <label>Account Number *</label>
                      <input type="text" value={withdrawBankDetails.accountNumber}
                        onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, accountNumber: e.target.value }))}
                        placeholder="Enter account number" />
                    </div>
                    <div className="form-group">
                      <label>IFSC Code *</label>
                      <input type="text" value={withdrawBankDetails.ifsc}
                        onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, ifsc: e.target.value.toUpperCase() }))}
                        placeholder="Enter IFSC code" />
                    </div>
                    <div className="form-group">
                      <label>UPI ID (Optional - for faster withdrawal)</label>
                      <input type="text" value={withdrawBankDetails.upiId || ''}
                        onChange={(e) => setWithdrawBankDetails(prev => ({ ...prev, upiId: e.target.value }))}
                        placeholder="e.g., yourname@upi" />
                    </div>
                  </div>
                )}

                {withdrawMethod === 'crypto' && (
                  <div className="crypto-details-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group">
                      <label>Network *</label>
                      <select value={withdrawCryptoDetails.network}
                        onChange={(e) => setWithdrawCryptoDetails(prev => ({ ...prev, network: e.target.value }))}>
                        <option value="">Select network</option>
                        <option value="BTC">Bitcoin (BTC)</option>
                        <option value="ETH">Ethereum (ETH)</option>
                        <option value="USDT-TRC20">USDT (TRC20)</option>
                        <option value="USDT-ERC20">USDT (ERC20)</option>
                        <option value="BNB">BNB (BSC)</option>
                        <option value="SOL">Solana (SOL)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Wallet Address *</label>
                      <input type="text" value={withdrawCryptoDetails.address}
                        onChange={(e) => setWithdrawCryptoDetails(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Enter your wallet address" />
                    </div>
                  </div>
                )}
              </div>
            )}

            <button className="submit-btn" onClick={submitRequest}>
              {activeTab === 'deposit' ? 'Submit Deposit Request' : 'Submit Withdrawal Request'}
            </button>
          </div>
            </>
          )}
        </div>

        <div className="transactions-card">
          <h3>Transaction History</h3>
          {transactions.length === 0 ? (
            <p className="no-transactions">No transactions yet</p>
          ) : (
            <div className="transactions-list">
              {transactions.slice().reverse().map(tx => (
                <div key={tx.id || tx._id} className={`transaction-item ${tx.type}`}>
                  <div className="tx-icon">{tx.type === 'deposit' ? '↓' : '↑'}</div>
                  <div className="tx-info">
                    <span className="tx-type">{tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</span>
                    <span className="tx-date">{new Date(tx.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="tx-amount">{tx.currency === 'INR' ? '₹' : '$'}{Number(tx.amount || 0).toFixed(2)}</div>
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

export default WalletPage;
