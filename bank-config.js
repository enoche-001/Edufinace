/* Bank link settings.
   mode "demo"  -> works today, no company papers needed: fake bank + test alerts.
   mode "mono"  -> real linking through Mono. Fill in the two values below after you deploy /server
                   (see BANK_SETUP_GUIDE.md). The public key is safe to ship; the SECRET key never goes here. */
window.EDU_BANK_CONFIG = {
    mode: 'demo',
    monoPublicKey: '',          // e.g. test_pk_xxxxxxxx (from the Mono dashboard)
    apiBase: ''                 // e.g. https://edufinance-bank.vercel.app (your deployed /server)
};
