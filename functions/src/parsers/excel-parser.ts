import * as XLSX from 'xlsx';

/**
 * Parses an Excel file from a binary string into an array of objects.
 * This is a lightweight alternative to exceljs for read-only operations.
 *
 * @param fileContent The binary string content of the Excel file.
 * @returns An array of objects, where each object represents a row in the first sheet.
 */
export function parseExcel(fileContent: string): Record<string, unknown>[] {
    try {
        const workbook = XLSX.read(fileContent, { type: 'binary', cellDates: true });
        
        if (workbook.SheetNames.length === 0) {
            throw new Error("A planilha está vazia ou não contém nenhuma aba.");
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
            // raw: false ensures dates are parsed if possible
        });

        return data;

    } catch (error) {
        console.error("Erro ao analisar a planilha com xlsx:", error);
        throw new Error("O formato do arquivo Excel é inválido ou está corrompido.");
    }
}
