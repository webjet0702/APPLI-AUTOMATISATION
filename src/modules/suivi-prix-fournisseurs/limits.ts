// Partagé entre le navigateur et le serveur.

/** Vercel refuse les envois de plus de 4,5 Mo : on s'arrête un peu avant. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
