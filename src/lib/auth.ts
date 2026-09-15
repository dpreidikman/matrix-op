// Usuarios y permisos de la app.
//
// IMPORTANTE — esto es un gate de UI, no seguridad real: toda la app corre
// en el navegador y los "usuarios" viven en localStorage de ese navegador.
// Cualquier persona con acceso a las herramientas de desarrollador puede
// leer el hash o saltear el chequeo. Alcanza para separar "quién ve/edita
// qué" en el uso normal de la app, pero si estos datos financieros
// necesitan protección real, hay que migrar a Supabase Auth (el proyecto
// ya tiene el cliente conectado en src/integrations/supabase).

export type Role = "administrador" | "usuario";

export type AppUser = {
  id: string;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: Role;
};

const USERS_KEY = "matrix:v1:users";
const SESSION_KEY = "matrix:v1:session";

// Usuario semilla: David Preidikman, administrador.
// El hash corresponde a la contraseña inicial "matrix2026" (SHA-256) —
// nunca se guarda ni se commitea la contraseña en texto plano.
const SEED_USERS: AppUser[] = [
  {
    id: "seed-david-preidikman",
    nombre: "David Preidikman",
    email: "davidpreidikman95@gmail.com",
    passwordHash: "eb02a5d8adb2758f07af192a4ab68ddf4cdfeefd4cc72790b363c95c5b229af3",
    rol: "administrador",
  },
];

const genId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function loadUsers(): AppUser[] {
  if (typeof window === "undefined") return SEED_USERS;
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      localStorage.setItem(USERS_KEY, JSON.stringify(SEED_USERS));
      return SEED_USERS;
    }
    return JSON.parse(raw) as AppUser[];
  } catch (e) {
    console.warn("users load failed", e);
    return SEED_USERS;
  }
}

function saveUsers(users: AppUser[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn("users save failed", e);
  }
}

export async function addOrUpdateUser(input: {
  id?: string;
  nombre: string;
  email: string;
  password?: string; // vacío al editar = no cambiar la contraseña
  rol: Role;
}): Promise<AppUser[]> {
  const users = loadUsers();
  const email = input.email.trim().toLowerCase();
  const i = users.findIndex((u) => u.id === input.id || u.email.toLowerCase() === email);
  const passwordHash = input.password ? await sha256Hex(input.password) : (i >= 0 ? users[i].passwordHash : "");
  const user: AppUser = { id: input.id ?? (i >= 0 ? users[i].id : genId()), nombre: input.nombre, email, passwordHash, rol: input.rol };
  const next = i >= 0 ? users.map((u, idx) => (idx === i ? user : u)) : [...users, user];
  saveUsers(next);
  return next;
}

export function removeUser(id: string): AppUser[] {
  const next = loadUsers().filter((u) => u.id !== id);
  saveUsers(next);
  return next;
}

export async function login(email: string, password: string): Promise<AppUser | null> {
  const hash = await sha256Hex(password);
  const user = loadUsers().find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.passwordHash === hash);
  if (user && typeof window !== "undefined") {
    try {
      sessionStorage.setItem(SESSION_KEY, user.id);
    } catch (e) {
      console.warn("session save failed", e);
    }
  }
  return user ?? null;
}

export function logout(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {
    console.warn("session clear failed", e);
  }
}

export function currentUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  try {
    const id = sessionStorage.getItem(SESSION_KEY);
    if (!id) return null;
    return loadUsers().find((u) => u.id === id) ?? null;
  } catch {
    return null;
  }
}
