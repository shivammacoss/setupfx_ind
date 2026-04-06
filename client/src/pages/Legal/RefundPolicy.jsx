import LegalPageShell from './LegalPageShell';

export default function RefundPolicy() {
  return (
    <LegalPageShell
      title="Refund Policy"
      subtitle="Deposits, withdrawals, and fee reversals"
      lastUpdated="March 2025"
    >
      <section className="terms-section">
        <h2>1. General</h2>
        <p>
          This Refund Policy explains how refundable amounts, chargebacks, and related disputes are handled on SetupFX.
          Trading profits and losses from market activity are not &quot;refunds&quot; in the sense of reversing completed
          trades; they follow market execution and Platform rules.
        </p>
      </section>

      <section className="terms-section">
        <h2>2. Deposits</h2>
        <ul>
          <li>
            Deposits credited to your account after successful verification are generally <strong>non-refundable</strong>{' '}
            as cash reversals once used for trading or fees, except where required by law or as stated below.
          </li>
          <li>
            If a deposit fails or is duplicated due to a processing error, we will work with you and payment partners to
            correct or return the erroneous amount where technically and legally possible.
          </li>
          <li>
            Third-party payment providers (banks, UPI, cards, crypto networks) may have their own timelines and fees for
            reversals.
          </li>
        </ul>
      </section>

      <section className="terms-section">
        <h2>3. Withdrawals</h2>
        <p>
          Withdrawal requests are processed subject to verification, anti-fraud checks, and available free balance.
          Approved withdrawals are sent to the method and account details you provide. Incorrect details supplied by you
          may delay or prevent recovery of funds; we are not liable for losses caused by wrong beneficiary information.
        </p>
      </section>

      <section className="terms-section">
        <h2>4. Fees &amp; charges</h2>
        <p>
          Spreads, commissions, swaps, and other disclosed fees are earned or charged as per the Platform and are not
          refundable merely because a trade resulted in a loss, unless a specific promotional rule or error on our part
          applies.
        </p>
      </section>

      <section className="terms-section">
        <h2>5. Chargebacks &amp; disputes</h2>
        <p>
          Initiating a chargeback or payment dispute without contacting support first may lead to account restrictions
          pending investigation. We will cooperate with lawful requests and provide evidence to processors where
          appropriate.
        </p>
      </section>

      <section className="terms-section">
        <h2>6. Processing time</h2>
        <p>
          Refunds or corrections, when approved, may take several business days depending on banks and payment rails.
          We do not control third-party settlement times.
        </p>
      </section>

      <section className="terms-section disclaimer-section">
        <h2>7. Contact</h2>
        <p>
          For refund-related questions, open a ticket or contact official support through the Platform with your user ID,
          transaction references, and a clear description of the issue.
        </p>
      </section>
    </LegalPageShell>
  );
}
