import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function BrandManagement() {
  const { API_URL } = useOutletContext();
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [bannerForm, setBannerForm] = useState({ title: '', subtitle: '', imageData: '', link: '', isActive: true });
  const [imagePreview, setImagePreview] = useState('');

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/banners`);
      const data = await res.json();
      setBanners(data.banners || []);
    } catch (error) {
      console.error('Error fetching banners:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  // Handle image upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Image size should be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        setBannerForm(prev => ({ ...prev, imageData: base64 }));
        setImagePreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  // Add banner
  const addBanner = async () => {
    if (!bannerForm.title || !bannerForm.imageData) {
      alert('Please fill in title and upload an image');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/banners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bannerForm)
      });
      const data = await res.json();
      if (data.success) {
        setBanners(prev => [data.banner, ...prev]);
        setBannerForm({ title: '', subtitle: '', imageData: '', link: '', isActive: true });
        setImagePreview('');
        setShowModal(false);
        alert('Banner added successfully!');
      } else {
        alert(data.error || 'Failed to add banner');
      }
    } catch (error) {
      console.error('Error adding banner:', error);
      alert('Failed to add banner');
    }
  };

  // Delete banner
  const deleteBanner = async (id) => {
    if (!confirm('Are you sure you want to delete this banner?')) return;
    try {
      const res = await fetch(`${API_URL}/api/banners/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setBanners(prev => prev.filter(b => b._id !== id));
        alert('Banner deleted successfully!');
      } else {
        alert(data.error || 'Failed to delete banner');
      }
    } catch (error) {
      console.error('Error deleting banner:', error);
      alert('Failed to delete banner');
    }
  };

  // Toggle banner status
  const toggleBannerStatus = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/banners/${id}/toggle`, { method: 'PATCH' });
      const data = await res.json();
      if (data.success) {
        setBanners(prev => prev.map(b => b._id === id ? data.banner : b));
      } else {
        alert(data.error || 'Failed to update banner status');
      }
    } catch (error) {
      console.error('Error toggling banner:', error);
      alert('Failed to update banner status');
    }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>Banner Management</h2>
        <button onClick={() => setShowModal(true)} className="admin-btn primary">+ Add Banner</button>
      </div>

      {loading ? (
        <div className="admin-loading">Loading banners...</div>
      ) : (
        <div className="admin-grid-cards">
          {banners.length === 0 ? (
            <div className="no-data-card">No banners configured</div>
          ) : (
            banners.map((banner, idx) => (
              <div key={banner._id || idx} className="admin-card">
                {banner.imageData && (
                  <img src={banner.imageData} alt={banner.title} className="admin-card-image" />
                )}
                <div className="admin-card-body">
                  <h4>{banner.title}</h4>
                  <p>{banner.subtitle}</p>
                  <div className="action-buttons">
                    <button onClick={() => toggleBannerStatus(banner._id)} className={`admin-btn ${banner.isActive ? 'warning' : 'success'} small`}>
                      {banner.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => deleteBanner(banner._id)} className="admin-btn danger small">Delete</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Banner Modal */}
      {showModal && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Add New Banner</h3>
              <button onClick={() => setShowModal(false)} className="admin-modal-close">&times;</button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label>Title *</label>
                <input type="text" value={bannerForm.title} onChange={(e) => setBannerForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Banner title" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Subtitle</label>
                <input type="text" value={bannerForm.subtitle} onChange={(e) => setBannerForm(prev => ({ ...prev, subtitle: e.target.value }))} placeholder="Banner subtitle" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Link URL</label>
                <input type="text" value={bannerForm.link} onChange={(e) => setBannerForm(prev => ({ ...prev, link: e.target.value }))} placeholder="https://..." className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Banner Image *</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="admin-input" />
                {imagePreview && <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: 150, objectFit: 'cover', marginTop: 10, borderRadius: 8 }} />}
              </div>
            </div>
            <div className="admin-modal-footer">
              <button onClick={() => setShowModal(false)} className="admin-btn">Cancel</button>
              <button onClick={addBanner} className="admin-btn primary">Add Banner</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BrandManagement;
