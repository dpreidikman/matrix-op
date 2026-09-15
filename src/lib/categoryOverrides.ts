// Reglas de categorización manual para gastos que llegan como "SIN CATEGORIA"
// (categoría original del archivo de Gastos Detallados, sin sub-categoría).
// Se guardan en el navegador y se aplican tanto a futuras cargas como a los
// datos ya cargados (ver reclassifyGastos en matrixParser.ts).

const STORAGE_KEY = "matrix:v1:catOverrides";

// key: categoría original normalizada (tal como viene en la columna "Categoria")
// value: concepto destino exacto del esqueleto MATRIX
export type CategoryOverrides = Record<string, string>;

export const normalizeCategoriaKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

export function loadCategoryOverrides(): CategoryOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CategoryOverrides) : {};
  } catch (e) {
    console.warn("category overrides load failed", e);
    return {};
  }
}

export function saveCategoryOverrides(overrides: CategoryOverrides): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.warn("category overrides save failed", e);
  }
}

// Asigna la categoría original (ej. "Gtos de Operacion") a un concepto destino
// del esqueleto MATRIX (ej. "LIMPIEZA"), y persiste la regla.
export function setCategoryOverride(categoriaOriginal: string, concepto: string): CategoryOverrides {
  const next = { ...loadCategoryOverrides(), [normalizeCategoriaKey(categoriaOriginal)]: concepto };
  saveCategoryOverrides(next);
  return next;
}

export function removeCategoryOverride(categoriaOriginal: string): CategoryOverrides {
  const next = { ...loadCategoryOverrides() };
  delete next[normalizeCategoriaKey(categoriaOriginal)];
  saveCategoryOverrides(next);
  return next;
}
