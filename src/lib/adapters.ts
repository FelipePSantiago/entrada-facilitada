
/**
 * @fileOverview Utility functions for converting between different data types safely.
 * This module provides adapters to ensure that data structures are consistent
 * across different parts of the application, such as when combining pricing data
 * with availability status.
 */
import type { CombinedUnit, UnitStatus } from "@/types";

/**
 * Converts a UnitPricingInCents object to a CombinedUnit object.
 * This function is crucial for merging data from separate "pricing" and "availability"
 * sources into a single, consistent object for use in the UI. It ensures that
 * every unit has a defined status and floor, preventing runtime errors.
 *
 * @param pricingUnit - The unit data coming from the pricing list (values in cents).
 * @param availabilityInfo - Optional availability info (status and floor) to merge.
 * @returns A fully-formed CombinedUnit object with default fallbacks.
 */
export function toCombinedUnit(
 pricingUnit: CombinedUnit, // Use CombinedUnit directly as it includes pricing fields
  availabilityInfo?: { status?: UnitStatus; floor?: string }
): CombinedUnit {
  // CORREÇÃO: Garantir que tanto unitId quanto unitNumber sejam sempre tratados como strings.
  const unitId = String(pricingUnit.unitId).trim();
  const unitNumber = String(pricingUnit.unitNumber).trim();
  
  const defaultStatus: UnitStatus = 'Disponível';
  
  // Combine the pricing and availability info, providing default values to prevent errors.
  const combined: CombinedUnit = {
    ...pricingUnit,
    unitId: unitId,
    unitNumber: unitNumber,
    status: availabilityInfo?.status || defaultStatus,
    floor: availabilityInfo?.floor || 'N/A', 
    privateArea: pricingUnit.privateArea || 0,
    sunPosition: pricingUnit.sunPosition || 'N/A',
    parkingSpaces: pricingUnit.parkingSpaces || 0,
    typology: pricingUnit.typology || 'N/A',
    // totalArea is not part of the core Unit type but is on UnitPricingInCents
    // so we don't need to add it here, it comes from the spread ...pricingUnit
  };

  return combined;
}
