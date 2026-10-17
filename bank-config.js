/* Bank link settings (Mono).
   Use your Mono TEST keys while you verify (test_pk_...). Switch to live keys only after Mono approves your business.
   The public key is safe to ship. The SECRET key lives only on the server (see BANK_SETUP_GUIDE.md). */
window.EDU_BANK_CONFIG = {
    monoPublicKey: 'test_pk_ej5u8qo9ot7q6ah8i11b',          // e.g. test_pk_xxxxxxxx
    apiBase: 'https://edufinanceapi.vercel.app'   // your existing Vercel project (same one as Gemini)
};
