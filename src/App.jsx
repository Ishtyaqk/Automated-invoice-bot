import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db, firebaseConfigError } from './firebase';
import './App.css';

const CATEGORIES = ['All', 'Eating Out', 'Groceries', 'Utilities', 'Transport', 
                    'Shopping', 'Subscriptions', 'Tech & Office', 'Medical', 'Miscellaneous'];

export default function App() {
  const [receipts, setReceipts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(firebaseConfigError || '');

  useEffect(() => {
    if (firebaseConfigError) {
      return;
    }

    const fetchReceipts = async () => {
      try {
        const q = query(collection(db, 'receipts'), orderBy('date', 'desc'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setReceipts(data);
        setFiltered(data);
      } catch(err) {
        console.error('Firebase fetch failed', err);
        setError('Unable to load receipt data. Please check Firebase configuration.');
      }
    };

    fetchReceipts();
  }, []);

  useEffect(() => {
    let result = receipts;
    if (category !== 'All') result = result.filter(r => r.category === category);
    if (search) result = result.filter(r => r.vendor?.toLowerCase().includes(search.toLowerCase()));
    setFiltered(result);
  }, [category, search, receipts]);

  const total = filtered.reduce((sum, r) => sum + (r.amount || 0), 0);

  // Helper to format category for the badge CSS class
  const getBadgeClass = (cat) => {
    if (!cat) return 'badge-default';
    const normalized = cat.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `badge badge-${normalized}`;
  };

  return (
    <div className="dashboard-container">
      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}
      <header className="dashboard-header">
        <div className="header-icon">🧾</div>
        <div className="header-content">
          <div>
            <h1>Receipt Dashboard</h1>
            <p className="subtitle">AI-powered expense tracking and organization</p>
          </div>
          <a
            className="bot-link"
            href="https://t.me/Receiptorgbot"
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 Test bot on Telegram
          </a>
        </div>
      </header>
      
      {/* Summary */}
      <div className="summary-grid">
        <div className="summary-card card-blue">
          <div className="card-label">Total Receipts</div>
          <div className="card-value">{filtered.length}</div>
        </div>
        <div className="summary-card card-green">
          <div className="card-label">Total Spend</div>
          <div className="card-value font-mono">
            ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="controls">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search vendors..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field"
          />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="select-field"
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vendor</th>
              <th>Amount</th>
              <th>Category</th>
              <th className="text-right">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="col-date">{r.date}</td>
                <td className="col-vendor">{r.vendor}</td>
                <td className="col-amount font-mono">
                  {r.currency === 'USD' ? '$' : r.currency === 'EUR' ? '€' : '₹'}
                  {r.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="col-category">
                  <span className={getBadgeClass(r.category)}>
                    {r.category}
                  </span>
                </td>
                <td className="col-action text-right">
                  {r.imageUrl ? (
                    <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" className="btn-view">
                      View
                    </a>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan="5" className="empty-state">
                  No receipts match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

