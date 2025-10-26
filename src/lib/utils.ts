// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format currency
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// Format date
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR").format(dateObj);
}

// Format date with options
export function formatDateWithOptions(
  date: Date | string, 
  options: Intl.DateTimeFormatOptions = {}
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  };
  return new Intl.DateTimeFormat("pt-BR", defaultOptions).format(dateObj);
}

// Format percentage
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

// Generate random ID
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Debounce function
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Validate email
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate phone number (Brazil)
export function isValidPhoneNumber(phone: string): boolean {
  const phoneRegex = /^\(?[1-9]{2}\)? ?(?:[2-8]|9[1-9])[0-9]{3}-?[0-9]{4}$/;
  return phoneRegex.test(phone);
}

// Format phone number (Brazil)
export function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, "");
  
  // Check if it has 10 or 11 digits
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  } else if (cleaned.length === 11) {
    return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  
  return phone;
}

// Format CPF (Brazil)
export function formatCPF(cpf: string): string {
  // Remove all non-numeric characters
  const cleaned = cpf.replace(/\D/g, "");
  
  // Check if it has 11 digits
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  
  return cpf;
}

// Validate CPF (Brazil)
export function isValidCPF(cpf: string): boolean {
  // Remove all non-numeric characters
  const cleaned = cpf.replace(/\D/g, "");
  
  // Check if it has 11 digits
  if (cleaned.length !== 11) return false;
  
  // Check if all digits are the same
  if (/^(\d)\1{10}$/.test(cleaned)) return false;
  
  // Validate CPF digits
  let sum = 0;
  let remainder;
  
  // Validate first digit
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleaned.substring(i - 1, i)) * (11 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleaned.substring(9, 10))) return false;
  
  // Validate second digit
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleaned.substring(i - 1, i)) * (12 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleaned.substring(10, 11))) return false;
  
  return true;
}

// Calculate age from birth date
export function calculateAge(birthDate: Date | string): number {
  const date = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDifference = today.getMonth() - date.getMonth();
  
  if (monthDifference < 0 || 
      (monthDifference === 0 && today.getDate() < date.getDate())) {
    age--;
  }
  
  return age;
}

// Get file extension
export function getFileExtension(filename: string): string {
  return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Truncate text
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// Capitalize first letter
export function capitalizeFirstLetter(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Convert string to slug
export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w ]+/g, "")
    .replace(/ +/g, "-");
}

// Generate color from string
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  let color = "#";
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += ("00" + value.toString(16)).substr(-2);
  }
  
  return color;
}

// Check if color is light
export function isLightColor(color: string): boolean {
  const hex = color.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return brightness > 155;
}

// Get contrast color (black or white) based on background color
export function getContrastColor(backgroundColor: string): string {
  return isLightColor(backgroundColor) ? "#000000" : "#ffffff";
}

// Calculate monthly payment
export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  months: number
): number {
  const monthlyRate = annualRate / 100 / 12;
  
  if (monthlyRate === 0) {
    return principal / months;
  }
  
  return (
    principal *
    (monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1)
  );
}

// Calculate total interest
export function calculateTotalInterest(
  principal: number,
  annualRate: number,
  months: number
): number {
  const monthlyPayment = calculateMonthlyPayment(principal, annualRate, months);
  const totalPaid = monthlyPayment * months;
  return totalPaid - principal;
}

// Calculate amortization schedule
export function calculateAmortizationSchedule(
  principal: number,
  annualRate: number,
  months: number
): Array<{
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}> {
  const monthlyRate = annualRate / 100 / 12;
  const monthlyPayment = calculateMonthlyPayment(principal, annualRate, months);
  let balance = principal;
  const schedule = [];
  
  for (let month = 1; month <= months; month++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    balance -= principalPayment;
    
    schedule.push({
      month,
      payment: monthlyPayment,
      principal: principalPayment,
      interest: interestPayment,
      balance: Math.max(0, balance),
    });
  }
  
  return schedule;
}

// Get value from object with multiple possible keys
export function getValue(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    // Direct match
    if (obj[key] !== undefined) {
      return obj[key];
    }
    
    // Case-insensitive match
    const lowerKey = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowerKey);
    if (foundKey && obj[foundKey] !== undefined) {
      return obj[foundKey];
    }
  }
  return undefined;
}

/**
 * DEPRECATION WARNING: This function is named incorrectly.
 * The values being passed from the excel parser are already in Reais (float), not cents.
 * This function currently just formats the number as BRL currency.
 * The correct function to use is `formatCurrency`.
 * This function is kept for now to fix build errors until the logic can be refactored.
 */
export function centsToBrl(value: number): string {
  // This is technically incorrect as the name implies it converts cents to BRL.
  // However, the value passed is already a float in BRL.
  return formatCurrency(value);
}
