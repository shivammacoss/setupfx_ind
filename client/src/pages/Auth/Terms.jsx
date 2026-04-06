import { Link } from 'react-router-dom';
import './Auth.css';

function Terms() {
  return (
    <div className="auth-container">
      <div className="auth-card terms-card">
        <div className="auth-header">
          <h1 className="auth-logo">SetupFX</h1>
          <p className="auth-subtitle">Terms & Conditions</p>
        </div>

        <div className="terms-content">
          <section className="terms-section">
            <h2>1. Risk Disclosure</h2>
            <p>
              <strong>Trading in financial markets involves substantial risk of loss.</strong> 
              You should carefully consider whether trading is appropriate for you in light of 
              your financial condition. The high degree of leverage that is often obtainable in 
              trading can work against you as well as for you. The use of leverage can lead to 
              large losses as well as gains.
            </p>
          </section>

          <section className="terms-section warning-section">
            <h2>⚠️ Important Warning</h2>
            <ul>
              <li>Past performance is not indicative of future results</li>
              <li>You may lose more than your initial investment</li>
              <li>Trading can cause significant mental stress and anxiety</li>
              <li>Financial losses can impact your personal life and relationships</li>
              <li>Never invest money you cannot afford to lose</li>
            </ul>
          </section>

          <section className="terms-section">
            <h2>2. Mental Health Advisory</h2>
            <p>
              Trading in financial markets can be mentally and emotionally challenging. 
              The stress of potential financial losses, market volatility, and the pressure 
              of making quick decisions can lead to:
            </p>
            <ul>
              <li>Anxiety and stress-related disorders</li>
              <li>Sleep disturbances</li>
              <li>Depression in cases of significant losses</li>
              <li>Addiction-like behaviors</li>
            </ul>
            <p>
              We strongly recommend seeking professional guidance and maintaining a healthy 
              work-life balance. If you experience any mental health issues related to trading, 
              please seek professional help immediately.
            </p>
          </section>

          <section className="terms-section">
            <h2>3. Educational Requirement</h2>
            <p>
              Before engaging in any trading activity, you should:
            </p>
            <ul>
              <li>Complete proper education about financial markets</li>
              <li>Understand technical and fundamental analysis</li>
              <li>Practice with demo accounts before using real money</li>
              <li>Develop a solid trading strategy and risk management plan</li>
              <li>Consult with licensed financial advisors</li>
            </ul>
          </section>

          <section className="terms-section">
            <h2>4. Company's Role</h2>
            <p>
              SetupFX provides <strong>technical support and platform services only</strong>. 
              We do not provide:
            </p>
            <ul>
              <li>Investment advice or recommendations</li>
              <li>Guaranteed returns or profit promises</li>
              <li>Financial planning services</li>
              <li>Trading signals or tips</li>
            </ul>
            <p>
              All trading decisions are made solely by you. The company is not responsible 
              for any profits or losses resulting from your trading activities.
            </p>
          </section>

          <section className="terms-section">
            <h2>5. Your Responsibilities</h2>
            <p>By using SetupFX, you acknowledge and agree that:</p>
            <ul>
              <li>All investment decisions are your own responsibility</li>
              <li>You have read and understood the risks involved</li>
              <li>You are of legal age to trade in your jurisdiction</li>
              <li>You will not hold the company liable for any losses</li>
              <li>You will trade only with funds you can afford to lose</li>
              <li>You will seek professional advice when needed</li>
            </ul>
          </section>

          <section className="terms-section">
            <h2>6. No Guarantee of Profits</h2>
            <p>
              There is <strong>no guarantee of profits</strong> in trading. Market movements 
              are unpredictable and past performance does not guarantee future results. 
              You should be prepared for the possibility of losing your entire investment.
            </p>
          </section>

          <section className="terms-section">
            <h2>7. Regulatory Compliance</h2>
            <p>
              You are responsible for ensuring that your trading activities comply with 
              all applicable laws and regulations in your jurisdiction. SetupFX does not 
              provide services in jurisdictions where such services are prohibited.
            </p>
          </section>

          <section className="terms-section disclaimer-section">
            <h2>📋 Final Disclaimer</h2>
            <p>
              By registering on SetupFX, you confirm that you have read, understood, 
              and agree to all the terms and conditions stated above. You acknowledge 
              that trading involves substantial risk and that you are solely responsible 
              for your trading decisions and their outcomes.
            </p>
            <p>
              <strong>Trade responsibly. Learn before you invest. Never risk more than 
              you can afford to lose.</strong>
            </p>
          </section>
        </div>

        <div className="terms-footer">
          <Link to="/register" className="back-to-register">
            ← Back to Registration
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Terms;
