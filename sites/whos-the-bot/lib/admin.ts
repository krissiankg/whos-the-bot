export type ProviderName="nvidia"|"openai";
export type ProviderStatus={provider:ProviderName;saved:boolean;environmentConfigured:boolean;model:string;lastTestAt:string|null;lastTestOk:boolean|null};
export type AdminStatus={initialized:boolean;authenticated?:boolean;activeProvider:"environment"|"disabled"|ProviderName;effectiveProvider:ProviderName|null;updatedAt:string;providers:ProviderStatus[];
  usage:{reservedCalls:number;callLimit:number;resetsAt:string|null;activeRooms:number};
  testResult?:{provider:ProviderName;ok:boolean;reason:string};};
export const ADMIN_ERRORS:Record<string,string>={
  ADMIN_FORBIDDEN:"L’accès administrateur n’est pas autorisé sur ce serveur.",
  ADMIN_UNAUTHORIZED:"Ta session a expiré. Reconnecte-toi.",
  ADMIN_BAD_PASSWORD:"Mot de passe incorrect, ou administration pas encore initialisée.",
  ADMIN_PASSWORD_LENGTH:"Choisis un mot de passe de 12 à 128 caractères.",
  ADMIN_SETUP_REJECTED:"Le lien d’installation est invalide, expiré ou déjà utilisé. Si tu as déjà choisi ton mot de passe, connecte-toi.",
  ADMIN_RATE_LIMITED:"Trop de tentatives ou budget d’appels atteint. Attends avant de réessayer.",
  ADMIN_INVALID_KEY:"La clé doit contenir 20 à 512 caractères sans espaces.",
  ADMIN_SETUP_REQUIRED:"La liaison sécurisée de l’administration doit être installée sur ce serveur.",
  ADMIN_CONFIRM_REQUIRED:"Confirme les conditions du fournisseur avant de l’activer.",
  ADMIN_HTTPS_REQUIRED:"Utilise HTTPS ou localhost pour accéder à l’administration.",
  ADMIN_ORIGIN_REJECTED:"Cette action doit venir du site lui-même, en HTTPS ou sur localhost.",
  INVALID_REQUEST:"La demande n’est pas valide.",
  ADMIN_UNAVAILABLE:"Le service d’administration est momentanément indisponible. Tes clés enregistrées sont conservées.",
};
