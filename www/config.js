/* Réglages publics de l'application.
   La clé « publishable » de Supabase est faite pour être dans l'application :
   la sécurité repose sur les règles de la base de données (voir supabase/schema.sql).
   Ne mets JAMAIS ici la clé « secret » ou « service_role ». */
window.PF_CONFIG = {
  supabaseUrl: 'https://jncknmkgahxbcyqgvyaa.supabase.co',
  supabaseKey: 'sb_publishable_zeA1ngeOC_Ikd8WrPKpq5A_FEYhFTmr',
  /* Adresse de la politique de confidentialité une fois le site publié sur GitHub Pages,
     par exemple 'https://TON-COMPTE.github.io/points-de-famille/privacy.html'. Laisse vide pour masquer le lien. */
  privacyUrl: ''
};
