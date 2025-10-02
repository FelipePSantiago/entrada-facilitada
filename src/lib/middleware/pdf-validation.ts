
'use server';

import { validateFileSize, validateMimeType } from '@/lib/validators';

export async function validatePdfFile(file: File): Promise<{ isValid: boolean; error?: string }> {
  try {
    // Validar tamanho do arquivo
    if (!validateFileSize(file)) {
      return { isValid: false, error: 'O tamanho máximo do arquivo é 15MB.' };
    }

    // Validar tipo MIME
    if (!validateMimeType(file, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])) {
      return { isValid: false, error: 'Por favor, envie um arquivo PDF ou imagem válido.' };
    }

    // Validação adicional para PDFs
    if (file.type === 'application/pdf') {
      // Verificar se é um PDF válido lendo os primeiros bytes
      const arrayBuffer = await file.arrayBuffer();
      const header = new Uint8Array(arrayBuffer.slice(0, 5));
      const headerStr = String.fromCharCode(...header);
      
      if (!headerStr.startsWith('%PDF-')) {
        return { isValid: false, error: 'O arquivo não é um PDF válido.' };
      }
    }

    return { isValid: true };

  } catch (error) {
    console.error('Erro na validação do arquivo:', error);
    return { isValid: false, error: 'Erro ao validar o arquivo.' };
  }
}
