import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom';
import {
  LuChartBar, LuClipboardList, LuFilePen, LuLandmark, LuSave,
  LuTimer, LuTrash2, LuX, LuArrowDownLeft, LuArrowUpRight, LuWallet,
} from 'react-icons/lu';

// Default column configuration for deposit tables
// Merge saved columns with defaults to handle new columns added after user first visited
function mergeWithDefaults(saved, defaults) {
  if (!saved || !Array.isArray(saved)) return defaults;
  const savedIds = new Set(saved.map(c => c.id));
  const merged = [...saved];
  for (const def of defaults) {
    if (!savedIds.has(def.id)) {
      // Insert new column after the column it follows in defaults
      const defIdx = defaults.indexOf(def);
      const prevId = defIdx > 0 ? defaults[defIdx - 1].id : null;
      const insertIdx = prevId ? merged.findIndex(c => c.id === prevId) + 1 : merged.length;
      merged.splice(insertIdx, 0, { ...def });
    }
  }
  return merged;
}

const DEFAULT_DEPOSIT_COLUMNS = [
  { id: 'createdAt', label: 'Created / Updated Time', visible: true },
  { id: 'hierarchy', label: 'Hierarchy', visible: true },
  { id: 'userId', label: 'UserID', visible: true },
  { id: 'amount', label: 'Amount / Type', visible: true },
  { id: 'bonus', label: 'Bonus', visible: true },
  { id: 'status', label: 'Status', visible: true },
  { id: 'remark', label: 'Remark', visible: true },
  { id: 'orderRef', label: 'Order Ref', visible: true },
  { id: 'showImage', label: 'Show Image', visible: true },
  { id: 'accept', label: 'Accept', visible: true },
  { id: 'reject', label: 'Reject', visible: true },
  { id: 'position', label: 'Position', visible: true },
  { id: 'ledger', label: 'Ledger', visible: true },
  { id: 'delete', label: 'Delete', visible: true },
];

// Default column configuration for withdrawal tables (includes bank details)
const DEFAULT_WITHDRAWAL_COLUMNS = [
  { id: 'createdAt', label: 'Created / Updated Time', visible: true },
  { id: 'hierarchy', label: 'Hierarchy', visible: true },
  { id: 'userId', label: 'UserID', visible: true },
  { id: 'amount', label: 'Amount / Type', visible: true },
  { id: 'status', label: 'Status', visible: true },
  { id: 'accName', label: 'ACC Name', visible: true },
  { id: 'accNum', label: 'ACC Num', visible: true },
  { id: 'ifsc', label: 'IFSC', visible: true },
  { id: 'upiId', label: 'UPI ID', visible: true },
  { id: 'remark', label: 'Remark', visible: true },
  { id: 'orderRef', label: 'Order Ref', visible: true },
  { id: 'accept', label: 'Accept', visible: true },
  { id: 'reject', label: 'Reject', visible: true },
  { id: 'position', label: 'Position', visible: true },
  { id: 'ledger', label: 'Ledger', visible: true },
  { id: 'delete', label: 'Delete', visible: true },
];

function FundManagement() {
  const { API_URL } = useOutletContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ search: '', status: '' });
  
  // Column visibility and order state - separate for deposits and withdrawals
  const [depositColumns, setDepositColumns] = useState(() => {
    const saved = localStorage.getItem('fund-deposit-columns');
    return saved ? mergeWithDefaults(JSON.parse(saved), DEFAULT_DEPOSIT_COLUMNS) : DEFAULT_DEPOSIT_COLUMNS;
  });
  const [withdrawalColumns, setWithdrawalColumns] = useState(() => {
    const saved = localStorage.getItem('fund-withdrawal-columns');
    return saved ? JSON.parse(saved) : DEFAULT_WITHDRAWAL_COLUMNS;
  });
  const [showColumnModal, setShowColumnModal] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Image preview modal
  const [imagePreview, setImagePreview] = useState({ open: false, src: '' });
  
  // Ledger modal state
  const [ledgerModal, setLedgerModal] = useState({ open: false, userId: null, userName: '', transactions: [], loading: false });

  /** Global deposit/withdrawal stats (not scoped to table filters) */
  const [fundStats, setFundStats] = useState({
    totalDepositsApproved: 0,
    totalWithdrawalsApproved: 0,
    pendingRequestsCount: 0,
    netBalance: 0
  });
  const [fundStatsLoading, setFundStatsLoading] = useState(false);

  const fmtMoney = (v) => (typeof formatAdminCurrency === 'function' ? formatAdminCurrency(v) : `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`);

  const fetchFundStats = useCallback(async () => {
    setFundStatsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions?limit=1&page=1`);
      const data = await res.json();
      if (data.success && data.summary) {
        const s = data.summary;
        setFundStats({
          totalDepositsApproved: Number(s.totalDepositsApproved) || 0,
          totalWithdrawalsApproved: Number(s.totalWithdrawalsApproved) || 0,
          pendingRequestsCount: Number(s.pendingRequestsCount) || 0,
          netBalance: Number(s.netBalance) || 0
        });
      }
    } catch (e) {
      console.error('Error fetching fund stats:', e);
    } finally {
      setFundStatsLoading(false);
    }
  }, [API_URL]);
  
  // Get active tab to determine which columns to use
  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/withdrawals')) return 'withdrawal-requests';
    if (path.includes('/banks')) return 'bank-accounts';
    if (path.includes('/upi')) return 'upi-management';
    if (path.includes('/crypto')) return 'crypto-wallets';
    if (path.includes('/history')) return 'transaction-history';
    return 'deposit-requests';
  };
  const activeTab = getActiveTab();
  
  // Get current columns based on active tab
  const columns = activeTab === 'withdrawal-requests' ? withdrawalColumns : depositColumns;
  const setColumns = activeTab === 'withdrawal-requests' ? setWithdrawalColumns : setDepositColumns;
  
  // Save columns to localStorage when changed
  useEffect(() => {
    localStorage.setItem('fund-deposit-columns', JSON.stringify(depositColumns));
  }, [depositColumns]);
  
  useEffect(() => {
    localStorage.setItem('fund-withdrawal-columns', JSON.stringify(withdrawalColumns));
  }, [withdrawalColumns]);
  
  // Toggle column visibility
  const toggleColumn = (columnId) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    ));
  };
  
  // Move column up
  const moveColumnUp = (index) => {
    if (index === 0) return;
    setColumns(prev => {
      const newCols = [...prev];
      [newCols[index - 1], newCols[index]] = [newCols[index], newCols[index - 1]];
      return newCols;
    });
  };
  
  // Move column down
  const moveColumnDown = (index) => {
    if (index === columns.length - 1) return;
    setColumns(prev => {
      const newCols = [...prev];
      [newCols[index], newCols[index + 1]] = [newCols[index + 1], newCols[index]];
      return newCols;
    });
  };
  
  // Get visible columns
  const visibleColumns = columns.filter(col => col.visible);
  
  // Pagination calculations
  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  // Payment methods state - fetched from database
  const [paymentMethods, setPaymentMethods] = useState({
    bankAccounts: [],
    upiIds: [],
    cryptoWallets: []
  });
  
  // Fund requests state
  const [fundRequests, setFundRequests] = useState(() => {
    const saved = localStorage.getItem('SetupFX-fund-requests');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Forms for adding new payment methods
  const [bankForm, setBankForm] = useState({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', isActive: true });
  const [upiForm, setUpiForm] = useState({ upiId: '', name: '', qrImage: '', isActive: true });
  const [cryptoForm, setCryptoForm] = useState({ network: '', address: '', qrImage: '', isActive: true });
  const [qrPreview, setQrPreview] = useState('');

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.search) params.set('search', filter.search);
      if (filter.status) params.set('status', filter.status);
      
      const type = activeTab === 'deposit-requests' ? 'deposit' : 
                   activeTab === 'withdrawal-requests' ? 'withdrawal' : '';
      if (type) params.set('type', type);

      const res = await fetch(`${API_URL}/api/admin/transactions?${params}`);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle QR image upload
  const handleQrUpload = (type) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      setQrPreview(base64);
      if (type === 'upi') {
        setUpiForm(prev => ({ ...prev, qrImage: base64 }));
      } else if (type === 'crypto') {
        setCryptoForm(prev => ({ ...prev, qrImage: base64 }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Fetch payment details from database
  const fetchPaymentDetails = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details`);
      const data = await res.json();
      if (data.success) {
        setPaymentMethods({
          bankAccounts: data.bankAccounts || [],
          upiIds: data.upiIds || [],
          cryptoWallets: data.cryptoWallets || []
        });
      }
    } catch (error) {
      console.error('Error fetching payment details:', error);
    }
  };

  // Load payment methods on mount
  useEffect(() => {
    fetchPaymentDetails();
  }, []);

  // Add bank account - saves to database
  const addBankAccount = async () => {
    if (!bankForm.bankName || !bankForm.accountNumber || !bankForm.ifsc || !bankForm.accountHolder) {
      alert('Please fill all bank details');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bankForm)
      });
      const data = await res.json();
      if (data.success) {
        setBankForm({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', isActive: true });
        fetchPaymentDetails();
        alert('Bank account added successfully!');
      } else {
        alert(data.error || 'Failed to add bank account');
      }
    } catch (error) {
      alert('Error adding bank account');
    }
  };

  // Add UPI - saves to database
  const addUpi = async () => {
    if (!upiForm.upiId || !upiForm.name) {
      alert('Please fill UPI details');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/upi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upiForm)
      });
      const data = await res.json();
      if (data.success) {
        setUpiForm({ upiId: '', name: '', qrImage: '', isActive: true });
        setQrPreview('');
        fetchPaymentDetails();
        alert('UPI added successfully!');
      } else {
        alert(data.error || 'Failed to add UPI');
      }
    } catch (error) {
      alert('Error adding UPI');
    }
  };

  // Add Crypto Wallet - saves to database
  const addCryptoWallet = async () => {
    if (!cryptoForm.network || !cryptoForm.address) {
      alert('Please fill crypto wallet details');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/crypto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cryptoForm)
      });
      const data = await res.json();
      if (data.success) {
        setCryptoForm({ network: '', address: '', qrImage: '', isActive: true });
        setQrPreview('');
        fetchPaymentDetails();
        alert('Crypto wallet added successfully!');
      } else {
        alert(data.error || 'Failed to add crypto wallet');
      }
    } catch (error) {
      alert('Error adding crypto wallet');
    }
  };

  // Edit payment method state
  const [editModal, setEditModal] = useState({ open: false, type: '', item: null });
  const [editForm, setEditForm] = useState({});
  
  // View transaction details modal
  const [viewModal, setViewModal] = useState({ open: false, transaction: null });
  const [exporting, setExporting] = useState(false);

  // Export transactions to Excel (user-wise)
  const exportToExcel = async () => {
    setExporting(true);
    try {
      // Group transactions by user
      const userWiseData = {};
      transactions.forEach(tx => {
        const userId = tx.oderId || tx.userId || 'Unknown';
        const userName = tx.userName || 'Unknown User';
        const key = `${userId}_${userName}`;
        
        if (!userWiseData[key]) {
          userWiseData[key] = {
            userId,
            userName,
            transactions: [],
            totalDeposits: 0,
            totalWithdrawals: 0
          };
        }
        
        userWiseData[key].transactions.push(tx);
        if (tx.type === 'deposit' && tx.status === 'approved') {
          userWiseData[key].totalDeposits += tx.amount || 0;
        } else if (tx.type === 'withdrawal' && tx.status === 'approved') {
          userWiseData[key].totalWithdrawals += tx.amount || 0;
        }
      });

      // Create CSV content
      let csvContent = 'User ID,User Name,Transaction ID,Type,Amount,Bonus,Bonus Template,Method,Status,Date,Total Deposits,Total Withdrawals,Net Balance\n';
      
      Object.values(userWiseData).forEach(user => {
        user.transactions.forEach((tx, idx) => {
          const txId = tx._id?.slice(-8) || tx.id || '-';
          const type = tx.type || '-';
          const amount = tx.amount?.toFixed(2) || '0.00';
          const method = tx.paymentMethod || tx.method || '-';
          const status = tx.status || '-';
          const date = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '-';
          
          // Only show totals on first row for each user
          const totalDep = idx === 0 ? user.totalDeposits.toFixed(2) : '';
          const totalWith = idx === 0 ? user.totalWithdrawals.toFixed(2) : '';
          const netBal = idx === 0 ? (user.totalDeposits - user.totalWithdrawals).toFixed(2) : '';
          
          const bonus = tx.bonusAmount > 0 ? tx.bonusAmount.toFixed(2) : '';
          const bonusTpl = tx.bonusTemplateName || '';
          csvContent += `"${user.userId}","${user.userName}","${txId}","${type}","${amount}","${bonus}","${bonusTpl}","${method}","${status}","${date}","${totalDep}","${totalWith}","${netBal}"\n`;
        });
      });

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `fund_transactions_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert('Excel file downloaded successfully!');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  // Open edit modal for payment method
  const openEditModal = (type, item) => {
    setEditForm({ ...item });
    setEditModal({ open: true, type, item });
    if (item.qrImage) setQrPreview(item.qrImage);
  };

  // Save edited payment method
  const saveEditPaymentMethod = () => {
    const { type, item } = editModal;
    let updated;
    
    if (type === 'bank') {
      updated = {
        ...paymentMethods,
        bankAccounts: paymentMethods.bankAccounts.map(b => 
          b.id === item.id ? { ...b, ...editForm } : b
        )
      };
    } else if (type === 'upi') {
      updated = {
        ...paymentMethods,
        upiIds: paymentMethods.upiIds.map(u => 
          u.id === item.id ? { ...u, ...editForm } : u
        )
      };
    } else if (type === 'crypto') {
      updated = {
        ...paymentMethods,
        cryptoWallets: paymentMethods.cryptoWallets.map(c => 
          c.id === item.id ? { ...c, ...editForm } : c
        )
      };
    }
    
    setPaymentMethods(updated);
    localStorage.setItem('SetupFX-payment-methods', JSON.stringify(updated));
    setEditModal({ open: false, type: '', item: null });
    setEditForm({});
    setQrPreview('');
    alert('Payment method updated successfully!');
  };

  // Handle QR upload for edit form
  const handleEditQrUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      setQrPreview(base64);
      setEditForm(prev => ({ ...prev, qrImage: base64 }));
    };
    reader.readAsDataURL(file);
  };

  // Delete payment method - saves to database
  const deletePaymentMethod = async (type, id) => {
    if (!confirm('Are you sure you want to delete this payment method?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/payment-details/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchPaymentDetails();
        alert('Payment method deleted!');
      } else {
        alert(data.error || 'Failed to delete payment method');
      }
    } catch (error) {
      alert('Error deleting payment method');
    }
  };

  // Handle fund request (approve/reject) - localStorage based like original Admin.jsx
  const handleFundRequest = (requestId, action) => {
    const updatedRequests = fundRequests.map(req => {
      if (req.id === requestId) {
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        if (action === 'approve') {
          const users = JSON.parse(localStorage.getItem('SetupFX-users') || '[]');
          let userIndex = users.findIndex(u => u.id === req.userId);
          if (userIndex === -1) {
            users.push({ id: req.userId, name: req.userName, wallet: 0, credit: 0 });
            userIndex = users.length - 1;
          }
          if (req.type === 'deposit') {
            users[userIndex].wallet = (users[userIndex].wallet || 0) + req.amount;
          } else if (req.type === 'withdrawal') {
            users[userIndex].wallet = (users[userIndex].wallet || 0) - req.amount;
          }
          localStorage.setItem('SetupFX-users', JSON.stringify(users));
          const authData = JSON.parse(localStorage.getItem('SetupFX-auth') || '{}');
          if (authData.user && authData.user.id === req.userId) {
            authData.user.wallet = users[userIndex].wallet;
            authData.user.credit = users[userIndex].credit || 0;
            localStorage.setItem('SetupFX-auth', JSON.stringify(authData));
          }
        }
        return { ...req, status: newStatus, processedAt: new Date().toISOString() };
      }
      return req;
    });
    setFundRequests(updatedRequests);
    localStorage.setItem('SetupFX-fund-requests', JSON.stringify(updatedRequests));
    alert(`Request ${action}d successfully!`);
  };

  const processTransaction = async (txId, status, txDetails = null) => {
    const action = status === 'approved' ? 'approve' : 'reject';
    
    // Build confirmation message with user details
    let confirmMsg = `Are you sure you want to ${action} this transaction?`;
    if (txDetails) {
      const userName = txDetails.userName || txDetails.name || 'Unknown User';
      const amount = txDetails.amount || 0;
      const txType = txDetails.type || 'transaction';
      confirmMsg = `Are you sure you want to ${action} this ${txType}?\n\nUser: ${userName}\nAmount: ₹${amount.toLocaleString()}`;
    }
    
    if (!confirm(confirmMsg)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions/${txId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Transaction ${action}d successfully`);
        fetchTransactions();
        fetchFundStats();
      } else {
        alert(data.error || `Failed to ${action} transaction`);
      }
    } catch (error) {
      console.error('Error processing transaction:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'bank-accounts' || activeTab === 'upi-management' || activeTab === 'crypto-wallets') {
      fetchPaymentDetails();
    } else {
      fetchTransactions();
    }
  }, [activeTab, filter]);

  useEffect(() => {
    if (activeTab === 'deposit-requests' || activeTab === 'withdrawal-requests') {
      fetchFundStats();
    }
  }, [activeTab, fetchFundStats]);

  if (activeTab === 'bank-accounts') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>Bank Accounts</h2>
        </div>
        
        {/* Add Bank Account Form */}
        <div className="admin-form-card">
          <h3>Add New Bank Account</h3>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Bank Name</label>
              <input type="text" value={bankForm.bankName} onChange={(e) => setBankForm(prev => ({ ...prev, bankName: e.target.value }))} placeholder="e.g. HDFC Bank" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Account Number</label>
              <input type="text" value={bankForm.accountNumber} onChange={(e) => setBankForm(prev => ({ ...prev, accountNumber: e.target.value }))} placeholder="Account number" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>IFSC Code</label>
              <input type="text" value={bankForm.ifsc} onChange={(e) => setBankForm(prev => ({ ...prev, ifsc: e.target.value }))} placeholder="IFSC code" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Account Holder</label>
              <input type="text" value={bankForm.accountHolder} onChange={(e) => setBankForm(prev => ({ ...prev, accountHolder: e.target.value }))} placeholder="Account holder name" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Status</label>
              <select value={bankForm.isActive} onChange={(e) => setBankForm(prev => ({ ...prev, isActive: e.target.value === 'true' }))} className="admin-select">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <button onClick={addBankAccount} className="admin-btn primary">Add Bank</button>
          </div>
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Bank Name</th>
                <th>Account Number</th>
                <th>IFSC</th>
                <th>Account Holder</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.bankAccounts.length === 0 ? (
                <tr><td colSpan="6" className="no-data">No bank accounts configured</td></tr>
              ) : (
                paymentMethods.bankAccounts.map((bank, idx) => (
                  <tr key={bank.id || idx}>
                    <td>{bank.bankName}</td>
                    <td>{bank.accountNumber}</td>
                    <td>{bank.ifsc}</td>
                    <td>{bank.accountHolder}</td>
                    <td><span className={`status-badge status-${bank.isActive ? 'active' : 'inactive'}`}>{bank.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button onClick={() => openEditModal('bank', bank)} className="admin-btn primary small">Edit</button>
                        <button onClick={() => deletePaymentMethod('bank', bank._id)} className="admin-btn danger small">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Edit Payment Method Modal for Bank */}
        {editModal.open && editModal.type === 'bank' && (
          <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div className="modal-content" style={{
              background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Edit Bank Account</h3>
                <button className="admin-btn admin-btn-primary" onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); }} ><LuX size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Bank Name</label>
                  <input type="text" value={editForm.bankName || ''} onChange={(e) => setEditForm(prev => ({ ...prev, bankName: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Account Number</label>
                  <input type="text" value={editForm.accountNumber || ''} onChange={(e) => setEditForm(prev => ({ ...prev, accountNumber: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>IFSC Code</label>
                  <input type="text" value={editForm.ifsc || ''} onChange={(e) => setEditForm(prev => ({ ...prev, ifsc: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Account Holder</label>
                  <input type="text" value={editForm.accountHolder || ''} onChange={(e) => setEditForm(prev => ({ ...prev, accountHolder: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Status</label>
                  <select value={editForm.isActive ? 'active' : 'inactive'} onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))} className="admin-select" style={{ width: '100%' }}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); }} className="admin-btn admin-btn-primary"  style={{flex: 1}}>Cancel</button>
                  <button onClick={saveEditPaymentMethod} className="admin-btn admin-btn-success"  style={{flex: 1}}><LuSave size={14} /> Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'upi-management') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>UPI Management</h2>
        </div>
        
        {/* Add UPI Form */}
        <div className="admin-form-card">
          <h3>Add New UPI ID</h3>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>UPI ID</label>
              <input type="text" value={upiForm.upiId} onChange={(e) => setUpiForm(prev => ({ ...prev, upiId: e.target.value }))} placeholder="e.g. example@upi" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Name</label>
              <input type="text" value={upiForm.name} onChange={(e) => setUpiForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Display name" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>QR Code (Optional)</label>
              <input type="file" accept="image/*" onChange={handleQrUpload('upi')} className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Status</label>
              <select value={upiForm.isActive} onChange={(e) => setUpiForm(prev => ({ ...prev, isActive: e.target.value === 'true' }))} className="admin-select">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <button onClick={addUpi} className="admin-btn primary">Add UPI</button>
          </div>
          {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 10, borderRadius: 8 }} />}
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>UPI ID</th>
                <th>Name</th>
                <th>QR Code</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.upiIds.length === 0 ? (
                <tr><td colSpan="5" className="no-data">No UPI IDs configured</td></tr>
              ) : (
                paymentMethods.upiIds.map((upi, idx) => (
                  <tr key={upi.id || idx}>
                    <td>{upi.upiId}</td>
                    <td>{upi.name}</td>
                    <td>{upi.qrImage ? <span className="text-success">✓ Uploaded</span> : <span className="text-muted">No QR</span>}</td>
                    <td><span className={`status-badge status-${upi.isActive ? 'active' : 'inactive'}`}>{upi.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button onClick={() => openEditModal('upi', upi)} className="admin-btn primary small">Edit</button>
                        <button onClick={() => deletePaymentMethod('upi', upi._id)} className="admin-btn danger small">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Edit UPI Modal */}
        {editModal.open && editModal.type === 'upi' && (
          <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div className="modal-content" style={{
              background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Edit UPI</h3>
                <button className="admin-btn admin-btn-primary" onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }} ><LuX size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>UPI ID</label>
                  <input type="text" value={editForm.upiId || ''} onChange={(e) => setEditForm(prev => ({ ...prev, upiId: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Name</label>
                  <input type="text" value={editForm.name || ''} onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>QR Code Image</label>
                  <input type="file" accept="image/*" onChange={handleEditQrUpload} className="admin-input" />
                  {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 8, objectFit: 'contain' }} />}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Status</label>
                  <select value={editForm.isActive ? 'active' : 'inactive'} onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))} className="admin-select" style={{ width: '100%' }}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }} className="admin-btn admin-btn-primary"  style={{flex: 1}}>Cancel</button>
                  <button onClick={saveEditPaymentMethod} className="admin-btn admin-btn-success"  style={{flex: 1}}><LuSave size={14} /> Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'crypto-wallets') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>Crypto Wallets</h2>
        </div>
        
        {/* Add Crypto Wallet Form */}
        <div className="admin-form-card">
          <h3>Add New Crypto Wallet</h3>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Network</label>
              <select value={cryptoForm.network} onChange={(e) => setCryptoForm(prev => ({ ...prev, network: e.target.value }))} className="admin-select">
                <option value="">Select Network</option>
                <option value="BTC">Bitcoin (BTC)</option>
                <option value="ETH">Ethereum (ETH)</option>
                <option value="USDT-TRC20">USDT (TRC20)</option>
                <option value="USDT-ERC20">USDT (ERC20)</option>
                <option value="BNB">BNB (BSC)</option>
                <option value="SOL">Solana (SOL)</option>
                <option value="XRP">Ripple (XRP)</option>
                <option value="LTC">Litecoin (LTC)</option>
              </select>
            </div>
            <div className="admin-form-group">
              <label>Wallet Address</label>
              <input type="text" value={cryptoForm.address} onChange={(e) => setCryptoForm(prev => ({ ...prev, address: e.target.value }))} placeholder="Enter wallet address" className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>QR Code (Optional)</label>
              <input type="file" accept="image/*" onChange={handleQrUpload('crypto')} className="admin-input" />
            </div>
            <div className="admin-form-group">
              <label>Status</label>
              <select value={cryptoForm.isActive} onChange={(e) => setCryptoForm(prev => ({ ...prev, isActive: e.target.value === 'true' }))} className="admin-select">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <button onClick={addCryptoWallet} className="admin-btn primary">Add Wallet</button>
          </div>
          {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 10, borderRadius: 8 }} />}
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Network</th>
                <th>Address</th>
                <th>QR Code</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.cryptoWallets.length === 0 ? (
                <tr><td colSpan="5" className="no-data">No crypto wallets configured</td></tr>
              ) : (
                paymentMethods.cryptoWallets.map((wallet, idx) => (
                  <tr key={wallet.id || idx}>
                    <td><strong>{wallet.network}</strong></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{wallet.address}</td>
                    <td>{wallet.qrImage ? <span className="text-success">✓ Uploaded</span> : <span className="text-muted">No QR</span>}</td>
                    <td><span className={`status-badge status-${wallet.isActive ? 'active' : 'inactive'}`}>{wallet.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button onClick={() => openEditModal('crypto', wallet)} className="admin-btn primary small">Edit</button>
                        <button onClick={() => deletePaymentMethod('crypto', wallet._id)} className="admin-btn danger small">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Edit Crypto Modal */}
        {editModal.open && editModal.type === 'crypto' && (
          <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div className="modal-content" style={{
              background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Edit Crypto Wallet</h3>
                <button className="admin-btn admin-btn-primary" onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }} ><LuX size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Network</label>
                  <input type="text" value={editForm.network || ''} onChange={(e) => setEditForm(prev => ({ ...prev, network: e.target.value }))} className="admin-input" style={{ width: '100%' }} placeholder="e.g. BTC, ETH, USDT-TRC20" />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Wallet Address</label>
                  <input type="text" value={editForm.address || ''} onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>QR Code Image</label>
                  <input type="file" accept="image/*" onChange={handleEditQrUpload} className="admin-input" />
                  {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 8, objectFit: 'contain' }} />}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Status</label>
                  <select value={editForm.isActive ? 'active' : 'inactive'} onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))} className="admin-select" style={{ width: '100%' }}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }} className="admin-btn admin-btn-primary"  style={{flex: 1}}>Cancel</button>
                  <button onClick={saveEditPaymentMethod} className="admin-btn admin-btn-success"  style={{flex: 1}}><LuSave size={14} /> Save Changes</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render cell content based on column id
  const renderCell = (tx, columnId) => {
    switch (columnId) {
      case 'createdAt':
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{new Date(tx.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}, {new Date(tx.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            {tx.updatedAt && tx.updatedAt !== tx.createdAt && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(tx.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}, {new Date(tx.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            )}
          </div>
        );
      case 'hierarchy': {
        // Use parent info from API (enriched with user's parent hierarchy)
        const parentType = tx.parentType || 'ADMIN';
        const parentName = tx.parentName || 'Superadmin';
        const parentColor = parentType === 'BROKER' ? '#f59e0b' : parentType === 'SUBADMIN' ? '#8b5cf6' : '#10b981';
        return (
          <div>
            <div style={{ fontWeight: 600, color: parentColor }}>{parentType}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{parentName}</div>
          </div>
        );
      }
      case 'userId':
        return <span className="fund-user-badge">{tx.userName || tx.oderId}</span>;
      case 'amount':
        return (
          <div>
            <div style={{ fontWeight: 600, color: tx.type === 'deposit' ? '#10b981' : '#ef4444' }}>
              {tx.currency === 'INR' ? '₹' : '$'}{tx.amount?.toFixed(0) || 0}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{tx.type}</div>
          </div>
        );
      case 'bonus':
        return tx.bonusAmount > 0
          ? <span style={{ color: '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>🎁 +₹{tx.bonusAmount?.toFixed(0)}</span>
          : <span style={{ color: 'var(--text-secondary)' }}>—</span>;
      case 'status':
        return <span className={`fund-status-badge fund-status-${tx.status}`}>{tx.status?.charAt(0).toUpperCase() + tx.status?.slice(1)}</span>;
      case 'accName': {
        const accName = tx.withdrawalInfo?.bankDetails?.accountHolder || 
                        tx.withdrawalInfo?.upiDetails?.name ||
                        tx.paymentDetails?.accountHolder ||
                        tx.userName || '-';
        return <span style={{ color: 'var(--text-primary)' }}>{accName}</span>;
      }
      case 'accNum': {
        const accNum = tx.withdrawalInfo?.bankDetails?.accountNumber || 
                       tx.paymentDetails?.accountNumber || '-';
        return <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)' }}>{accNum}</span>;
      }
      case 'ifsc': {
        const ifsc = tx.withdrawalInfo?.bankDetails?.ifsc || 
                     tx.paymentDetails?.ifsc || '-';
        return <span style={{ fontFamily: 'monospace', fontSize: 12, background: ifsc !== '-' ? 'rgba(59, 130, 246, 0.1)' : 'transparent', padding: ifsc !== '-' ? '4px 8px' : 0, borderRadius: 4, color: ifsc !== '-' ? '#3b82f6' : 'var(--text-secondary)' }}>{ifsc}</span>;
      }
      case 'upiId': {
        const upiId = tx.withdrawalInfo?.upiDetails?.upiId || 
                      tx.withdrawalInfo?.bankDetails?.upiId ||
                      tx.paymentDetails?.upiId ||
                      tx.paymentDetails?.upiDetails?.upiId ||
                      (tx.withdrawalInfo?.cryptoDetails?.address ? tx.withdrawalInfo.cryptoDetails.address.slice(0, 20) + '...' : '-');
        return <span style={{ fontFamily: 'monospace', fontSize: 12, color: upiId !== '-' ? '#8b5cf6' : 'var(--text-secondary)' }}>{upiId}</span>;
      }
      case 'remark':
        return <span style={{ color: 'var(--text-secondary)' }}>{tx.remark || '-'}</span>;
      case 'orderRef':
        return <span style={{ color: 'var(--text-secondary)' }}>{tx.orderRef || tx.referenceNumber || '-'}</span>;
      case 'showImage':
        return tx.proofImage ? (
          <button onClick={() => setImagePreview({ open: true, src: tx.proofImage })} className="fund-action-btn fund-action-view">
            📷 Show Image
          </button>
        ) : <span style={{ color: 'var(--text-secondary)' }}>-</span>;
      case 'accept':
        return tx.status === 'pending' ? (
          <button onClick={() => processTransaction(tx._id, 'approved', tx)} className="fund-action-btn fund-action-accept">
            ✓ Accept
          </button>
        ) : tx.status === 'approved' ? (
          <span className="fund-status-badge fund-status-approved">✓ Accepted</span>
        ) : null;
      case 'reject':
        return tx.status === 'pending' ? (
          <button onClick={() => processTransaction(tx._id, 'rejected', tx)} className="fund-action-btn fund-action-reject">
            ✗ Reject
          </button>
        ) : tx.status === 'rejected' ? (
          <span className="fund-status-badge fund-status-rejected">✗ Rejected</span>
        ) : null;
      case 'position':
        return (
          <button onClick={() => goToUserPositions(tx.oderId || tx.userId, tx.userName)} className="fund-action-btn fund-action-position">
            <LuChartBar size={14} /> Position
          </button>
        );
      case 'ledger':
        return (
          <button onClick={() => openLedgerModal(tx.oderId || tx.userId, tx.userName)} className="fund-action-btn fund-action-ledger">
            <LuClipboardList size={14} /> Ledger
          </button>
        );
      case 'delete':
        return (
          <button onClick={() => deleteTransaction(tx._id)} className="fund-action-btn fund-action-delete">
            <LuTrash2 size={14} /> Delete
          </button>
        );
      default:
        return '-';
    }
  };

  // Delete transaction
  const deleteTransaction = async (txId) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions/${txId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        alert('Transaction deleted');
        fetchTransactions();
        fetchFundStats();
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  // Navigate to Trade Management Open Positions with user filter
  const goToUserPositions = (userId, userName) => {
    // Store the user filter in sessionStorage so Trade Management can pick it up
    sessionStorage.setItem('tradeManagementUserFilter', JSON.stringify({ userId, userName }));
    // Navigate to Open Positions tab (not Combined)
    navigate('/admin/trades/open');
  };

  // Open ledger modal and fetch user's transactions
  const openLedgerModal = async (userId, userName) => {
    setLedgerModal({ open: true, userId, userName, transactions: [], loading: true });
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setLedgerModal(prev => ({ ...prev, transactions: data.transactions || [], loading: false }));
      } else {
        setLedgerModal(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Error fetching user ledger:', error);
      setLedgerModal(prev => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>{activeTab === 'deposit-requests' ? 'Deposit Requests' : activeTab === 'withdrawal-requests' ? 'Withdrawal Requests' : 'Transaction History'}</h2>
      </div>

      {(activeTab === 'deposit-requests' || activeTab === 'withdrawal-requests') && (
        <div className="fund-stats-row" aria-busy={fundStatsLoading}>
          <div className="fund-stat-card">
            <div className="fund-stat-card__top">
              <div className="fund-stat-card__icon" style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.35)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e' }} aria-hidden><LuArrowDownLeft size={18} /></div>
              <div className="fund-stat-card__meta">
                <div className="fund-stat-card__label">Total Deposits</div>
                <div className="fund-stat-card__value">{fundStatsLoading ? '…' : fmtMoney(fundStats.totalDepositsApproved)}</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>Approved &amp; completed</div>
          </div>
          <div className="fund-stat-card">
            <div className="fund-stat-card__top">
              <div className="fund-stat-card__icon" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }} aria-hidden><LuArrowUpRight size={18} /></div>
              <div className="fund-stat-card__meta">
                <div className="fund-stat-card__label">Total Withdrawals</div>
                <div className="fund-stat-card__value">{fundStatsLoading ? '…' : fmtMoney(fundStats.totalWithdrawalsApproved)}</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>Approved &amp; completed</div>
          </div>
          <div className="fund-stat-card">
            <div className="fund-stat-card__top">
              <div className="fund-stat-card__icon" style={{ background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.35)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308' }} aria-hidden><LuTimer size={18} /></div>
              <div className="fund-stat-card__meta">
                <div className="fund-stat-card__label">Pending Requests</div>
                <div className="fund-stat-card__value">{fundStatsLoading ? '…' : fundStats.pendingRequestsCount}</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>Deposits &amp; withdrawals awaiting action</div>
          </div>
          <div className="fund-stat-card">
            <div className="fund-stat-card__top">
              <div className="fund-stat-card__icon" style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.35)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }} aria-hidden><LuWallet size={18} /></div>
              <div className="fund-stat-card__meta">
                <div className="fund-stat-card__label">Net Balance</div>
                <div
                  className="fund-stat-card__value"
                  style={{ color: fundStats.netBalance < 0 ? '#fca5a5' : '#f8fafc' }}
                >
                  {fundStatsLoading ? '…' : fmtMoney(fundStats.netBalance)}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>Deposits − withdrawals (approved)</div>
          </div>
        </div>
      )}

      <div className="admin-filters-bar">
        <input
          type="text"
          placeholder="Search by user..."
          value={filter.search}
          onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
          className="admin-input"
        />
        <select
          value={filter.status}
          onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value }))}
          className="admin-select"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button onClick={fetchTransactions} className="admin-btn primary">
          Search
        </button>
        <button 
          onClick={exportToExcel} 
          disabled={exporting || transactions.length === 0}
          className="admin-btn admin-btn-success"
          
        >
          {exporting ? '⏳ Exporting...' : '📥 Export Excel'}
        </button>
      </div>

      {loading ? (
        <div className="admin-loading">Loading transactions...</div>
      ) : (
        <>
          <div className="admin-table-wrapper fund-table-wrapper">
            <table className="admin-table fund-table">
              <thead>
                <tr>
                  {visibleColumns.map(col => (
                    <th key={col.id}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.length === 0 ? (
                  <tr><td colSpan={visibleColumns.length} className="no-data">No transactions found</td></tr>
                ) : (
                  paginatedTransactions.map((tx, idx) => (
                    <tr key={tx._id || idx}>
                      {visibleColumns.map(col => (
                        <td key={col.id}>{renderCell(tx, col.id)}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="fund-table-footer">
            <div className="fund-pagination-info">
              Page <strong>{currentPage}</strong> • Showing <strong>{paginatedTransactions.length}</strong> requests
              <span style={{ marginLeft: 12 }}>Show:</span>
              <select 
                value={itemsPerPage} 
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="fund-page-select"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="fund-pagination-controls">
              <button 
                onClick={() => setShowColumnModal(true)} 
                className="fund-columns-btn"
              >
                ☰ Columns ({visibleColumns.length}/{columns.length})
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1}
                className="fund-page-btn"
              >
                Previous
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                disabled={currentPage === totalPages || totalPages === 0}
                className="fund-page-btn fund-page-btn-next"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Column Visibility Modal */}
      {showColumnModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="fund-column-modal">
            <div className="fund-column-modal-header">
              <h3>{activeTab === 'deposit-requests' ? 'Deposit' : 'Withdrawal'} columns</h3>
              <button onClick={() => setShowColumnModal(false)} className="fund-modal-close"><LuX size={14} /></button>
            </div>
            <div className="fund-column-list">
              {columns.map((col, idx) => (
                <div key={col.id} className="fund-column-item">
                  <label className="fund-column-checkbox">
                    <input 
                      type="checkbox" 
                      checked={col.visible} 
                      onChange={() => toggleColumn(col.id)}
                    />
                    <span className="fund-checkmark"></span>
                    <span className="fund-column-label">{col.label}</span>
                  </label>
                  <div className="fund-column-arrows">
                    <button onClick={() => moveColumnUp(idx)} disabled={idx === 0} className="fund-arrow-btn">↑</button>
                    <button onClick={() => moveColumnDown(idx)} disabled={idx === columns.length - 1} className="fund-arrow-btn">↓</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="fund-column-modal-footer">
              <span>{visibleColumns.length} visible • Order saved in browser</span>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {imagePreview.open && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setImagePreview({ open: false, src: '' })}>
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <img src={imagePreview.src} alt="Payment Proof" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }} />
            <button className="admin-btn admin-btn-primary" onClick={() => setImagePreview({ open: false, src: '' })}  style={{position: 'absolute', top: -40, right: 0}}><LuX size={14} /></button>
          </div>
        </div>
      )}

      {/* Ledger Modal - User's Fund Transaction History */}
      {ledgerModal.open && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="fund-ledger-modal" style={{
            background: 'var(--bg-secondary)', borderRadius: 12, width: '95%', maxWidth: 900,
            maxHeight: '85vh', overflow: 'hidden', border: '1px solid var(--border-color)'
          }}>
            <div style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              padding: '20px 24px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' 
            }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}><LuClipboardList size={14} /> Fund Ledger</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                  Transaction history for <strong>{ledgerModal.userName || ledgerModal.userId}</strong>
                </p>
              </div>
              <button className="admin-btn admin-btn-primary" onClick={() => setLedgerModal({ open: false, userId: null, userName: '', transactions: [], loading: false })} ><LuX size={14} /></button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(85vh - 140px)' }}>
              {ledgerModal.loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading transactions...</div>
              ) : ledgerModal.transactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>No transactions found for this user</div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: 16, borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Total Deposits</p>
                      <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                        ₹{ledgerModal.transactions.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0).toLocaleString()}
                      </p>
                    </div>
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Total Withdrawals</p>
                      <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
                        ₹{ledgerModal.transactions.filter(t => t.type === 'withdrawal' && t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0).toLocaleString()}
                      </p>
                    </div>
                    <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: 16, borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Net Balance</p>
                      <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>
                        ₹{(
                          ledgerModal.transactions.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0) -
                          ledgerModal.transactions.filter(t => t.type === 'withdrawal' && t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0)
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Transaction Table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table" style={{ minWidth: 700 }}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Method</th>
                          <th>Status</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerModal.transactions.map((tx, idx) => (
                          <tr key={tx._id || idx}>
                            <td>{new Date(tx.createdAt).toLocaleDateString('en-GB')} {new Date(tx.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td>
                              <span style={{ 
                                padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                background: tx.type === 'deposit' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: tx.type === 'deposit' ? '#10b981' : '#ef4444'
                              }}>
                                {tx.type === 'deposit' ? '↓ Deposit' : '↑ Withdrawal'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: tx.type === 'deposit' ? '#10b981' : '#ef4444' }}>
                              {tx.type === 'deposit' ? '+' : '-'}{tx.currency === 'INR' ? '₹' : '$'}{tx.amount?.toLocaleString()}
                            </td>
                            <td style={{ textTransform: 'capitalize' }}>{tx.paymentMethod || tx.method || '-'}</td>
                            <td><span className={`fund-status-badge fund-status-${tx.status}`}>{tx.status}</span></td>
                            <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{tx._id?.slice(-8) || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div style={{ 
              padding: '16px 24px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {ledgerModal.transactions.length} transaction(s)
              </span>
              <button 
                onClick={() => setLedgerModal({ open: false, userId: null, userName: '', transactions: [], loading: false })}
                className="admin-btn admin-btn-primary"
                
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Transaction Details Modal */}
      {viewModal.open && viewModal.transaction && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 600,
            border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                {viewModal.transaction.type === 'deposit' ? '💰 Deposit' : '💸 Withdrawal'} Details
              </h3>
              <button className="admin-btn admin-btn-primary" onClick={() => setViewModal({ open: false, transaction: null })} ><LuX size={14} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Basic Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Transaction ID</p>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 0', fontFamily: 'monospace' }}>#{viewModal.transaction._id?.slice(-8) || viewModal.transaction.id}</p>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Status</p>
                  <span className={`status-badge status-${viewModal.transaction.status}`} style={{ marginTop: 4, display: 'inline-block' }}>{viewModal.transaction.status}</span>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>User</p>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 0' }}>{viewModal.transaction.userName || 'N/A'}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{viewModal.transaction.oderId}</p>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Amount ({viewModal.transaction.currency || 'USD'})</p>
                  <p style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0', color: viewModal.transaction.type === 'deposit' ? '#10b981' : '#ef4444' }}>
                    {viewModal.transaction.currency === 'INR' ? '₹' : '$'}{viewModal.transaction.amount?.toFixed(2)}
                  </p>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Method</p>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 0', textTransform: 'capitalize' }}>{viewModal.transaction.paymentMethod || viewModal.transaction.method || 'N/A'}</p>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Date</p>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 0' }}>{new Date(viewModal.transaction.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Deposit Proof Image */}
              {viewModal.transaction.type === 'deposit' && viewModal.transaction.proofImage && (
                <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>📷 Payment Proof</p>
                  <img 
                    src={viewModal.transaction.proofImage} 
                    alt="Payment Proof" 
                    style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                </div>
              )}

              {/* Withdrawal Details */}
              {viewModal.transaction.type === 'withdrawal' && viewModal.transaction.withdrawalInfo && (
                <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                    <LuLandmark size={14} /> Withdrawal Details ({viewModal.transaction.withdrawalInfo.method?.toUpperCase()})
                  </p>
                  
                  {(viewModal.transaction.withdrawalInfo.method === 'bank' || viewModal.transaction.withdrawalInfo.method === 'upi') && viewModal.transaction.withdrawalInfo.bankDetails && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Bank Name</span>
                        <span style={{ fontWeight: 600 }}>{viewModal.transaction.withdrawalInfo.bankDetails.bankName}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Account Holder</span>
                        <span style={{ fontWeight: 600 }}>{viewModal.transaction.withdrawalInfo.bankDetails.accountHolder}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Account Number</span>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{viewModal.transaction.withdrawalInfo.bankDetails.accountNumber}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: viewModal.transaction.withdrawalInfo.bankDetails.upiId ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>IFSC Code</span>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{viewModal.transaction.withdrawalInfo.bankDetails.ifsc}</span>
                      </div>
                      {viewModal.transaction.withdrawalInfo.bankDetails.upiId && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>📱 UPI ID</span>
                          <span style={{ fontWeight: 600, fontFamily: 'monospace', color: '#8b5cf6' }}>{viewModal.transaction.withdrawalInfo.bankDetails.upiId}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {viewModal.transaction.withdrawalInfo.method === 'crypto' && viewModal.transaction.withdrawalInfo.cryptoDetails && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Network</span>
                        <span style={{ fontWeight: 600 }}>{viewModal.transaction.withdrawalInfo.cryptoDetails.network}</span>
                      </div>
                      <div style={{ padding: '8px 0' }}>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Wallet Address</span>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{viewModal.transaction.withdrawalInfo.cryptoDetails.address}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Legacy withdrawal details (text field) */}
              {viewModal.transaction.type === 'withdrawal' && viewModal.transaction.withdrawDetails && !viewModal.transaction.withdrawalInfo && (
                <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}><LuFilePen size={14} /> Withdrawal Details</p>
                  <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 13 }}>{viewModal.transaction.withdrawDetails}</p>
                </div>
              )}

              {/* Payment Details from paymentDetails field */}
              {viewModal.transaction.paymentDetails && Object.keys(viewModal.transaction.paymentDetails).some(k => viewModal.transaction.paymentDetails[k]) && (
                <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>💳 Payment Details</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {viewModal.transaction.paymentDetails.bankName && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Bank</span>
                        <span>{viewModal.transaction.paymentDetails.bankName}</span>
                      </div>
                    )}
                    {viewModal.transaction.paymentDetails.accountNumber && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Account</span>
                        <span style={{ fontFamily: 'monospace' }}>{viewModal.transaction.paymentDetails.accountNumber}</span>
                      </div>
                    )}
                    {viewModal.transaction.paymentDetails.upiId && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>UPI ID</span>
                        <span style={{ fontFamily: 'monospace' }}>{viewModal.transaction.paymentDetails.upiId}</span>
                      </div>
                    )}
                    {viewModal.transaction.paymentDetails.walletAddress && (
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Wallet Address</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{viewModal.transaction.paymentDetails.walletAddress}</span>
                      </div>
                    )}
                    {viewModal.transaction.paymentDetails.referenceNumber && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Reference</span>
                        <span style={{ fontFamily: 'monospace' }}>{viewModal.transaction.paymentDetails.referenceNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {viewModal.transaction.status === 'pending' && (
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    onClick={() => { processTransaction(viewModal.transaction._id, 'approved', viewModal.transaction); setViewModal({ open: false, transaction: null }); }}
                    className="admin-btn success"
                    style={{ flex: 1 }}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => { processTransaction(viewModal.transaction._id, 'rejected', viewModal.transaction); setViewModal({ open: false, transaction: null }); }}
                    className="admin-btn danger"
                    style={{ flex: 1 }}
                  >
                    ✗ Reject
                  </button>
                </div>
              )}

              <button
                onClick={() => setViewModal({ open: false, transaction: null })}
                className="admin-btn admin-btn-primary"
                
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Method Modal */}
      {editModal.open && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Edit {editModal.type === 'bank' ? 'Bank Account' : editModal.type === 'upi' ? 'UPI' : 'Crypto Wallet'}
              </h3>
              <button className="admin-btn admin-btn-primary" onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }} ><LuX size={14} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Bank Account Fields */}
              {editModal.type === 'bank' && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Bank Name</label>
                    <input
                      type="text"
                      value={editForm.bankName || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, bankName: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Account Number</label>
                    <input
                      type="text"
                      value={editForm.accountNumber || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, accountNumber: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>IFSC Code</label>
                    <input
                      type="text"
                      value={editForm.ifsc || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, ifsc: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Account Holder</label>
                    <input
                      type="text"
                      value={editForm.accountHolder || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, accountHolder: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                </>
              )}

              {/* UPI Fields */}
              {editModal.type === 'upi' && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>UPI ID</label>
                    <input
                      type="text"
                      value={editForm.upiId || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, upiId: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Name</label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>QR Code Image</label>
                    <input type="file" accept="image/*" onChange={handleEditQrUpload} className="admin-input" />
                    {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 8, objectFit: 'contain' }} />}
                  </div>
                </>
              )}

              {/* Crypto Fields */}
              {editModal.type === 'crypto' && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Network</label>
                    <input
                      type="text"
                      value={editForm.network || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, network: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                      placeholder="e.g. BTC, ETH, USDT-TRC20"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Wallet Address</label>
                    <input
                      type="text"
                      value={editForm.address || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                      className="admin-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>QR Code Image</label>
                    <input type="file" accept="image/*" onChange={handleEditQrUpload} className="admin-input" />
                    {qrPreview && <img src={qrPreview} alt="QR Preview" style={{ width: 100, height: 100, marginTop: 8, objectFit: 'contain' }} />}
                  </div>
                </>
              )}

              {/* Status Toggle */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Status</label>
                <select
                  value={editForm.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))}
                  className="admin-select"
                  style={{ width: '100%' }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button
                  onClick={() => { setEditModal({ open: false, type: '', item: null }); setEditForm({}); setQrPreview(''); }}
                  className="admin-btn admin-btn-primary"
                   style={{flex: 1}}
                >
                  Cancel
                </button>
                <button
                  onClick={saveEditPaymentMethod}
                  className="admin-btn admin-btn-success"
                   style={{flex: 1}}
                >
                  <LuSave size={14} /> Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FundManagement;
