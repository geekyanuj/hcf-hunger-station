import { InventoryUnit } from '../models/InventoryItem';
import { ApiError } from './ApiError';

/**
 * Converts a quantity between compatible inventory units so a recipe can be
 * written in the most natural unit (e.g. "20g" of lettuce) while the
 * ingredient's stock is tracked in a different unit (e.g. "kg"). Only
 * same-dimension conversions are supported (mass↔mass, volume↔volume);
 * count-based units (piece/packet/box) have no conversion factor between
 * each other or to mass/volume — a recipe and its inventory item must use
 * the same count unit, or conversion throws.
 */
const MASS_TO_GRAMS: Partial<Record<InventoryUnit, number>> = { kg: 1000, g: 1 };
const VOLUME_TO_ML: Partial<Record<InventoryUnit, number>> = { litre: 1000, ml: 1 };

export function convertUnit(quantity: number, fromUnit: InventoryUnit, toUnit: InventoryUnit): number {
  if (fromUnit === toUnit) return quantity;

  if (fromUnit in MASS_TO_GRAMS && toUnit in MASS_TO_GRAMS) {
    const grams = quantity * MASS_TO_GRAMS[fromUnit]!;
    return grams / MASS_TO_GRAMS[toUnit]!;
  }

  if (fromUnit in VOLUME_TO_ML && toUnit in VOLUME_TO_ML) {
    const ml = quantity * VOLUME_TO_ML[fromUnit]!;
    return ml / VOLUME_TO_ML[toUnit]!;
  }

  throw ApiError.badRequest(
    `Cannot convert between incompatible units "${fromUnit}" and "${toUnit}" — count-based units (piece/packet/box) must match exactly between a recipe and its inventory item.`
  );
}
