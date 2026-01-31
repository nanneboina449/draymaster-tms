import { NextRequest, NextResponse } from 'next/server';
import {
  buildExtractionPrompt,
  extractWithRules,
  parseLLMResponse,
  mergeExtractedData,
} from '@/lib/pdf-extractor';

// Extract text from PDF using pdf-parse
async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(Buffer.from(buffer));
    return data.text;
  } catch (error) {
    console.error('PDF parsing failed:', error);
    throw new Error('Failed to extract text from PDF. Please ensure the file is a valid PDF.');
  }
}

// Call OpenAI API for extraction
async function extractWithOpenAI(pdfText: string): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a logistics document parser that extracts structured data from shipping documents. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: buildExtractionPrompt(pdfText),
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      return parseLLMResponse(content);
    }
    return null;
  } catch (error) {
    console.error('OpenAI extraction failed:', error);
    return null;
  }
}

// Call Anthropic API for extraction
async function extractWithClaude(pdfText: string): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: buildExtractionPrompt(pdfText),
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Anthropic API error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (content) {
      return parseLLMResponse(content);
    }
    return null;
  } catch (error) {
    console.error('Claude extraction failed:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('pdf') as File | null;

    if (!file) {
      return NextResponse.json(
        { message: 'No PDF file provided' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { message: 'File must be a PDF' },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { message: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Extract text from PDF
    const arrayBuffer = await file.arrayBuffer();
    let pdfText: string;

    try {
      pdfText = await extractTextFromPDF(arrayBuffer);
    } catch (error) {
      return NextResponse.json(
        { message: 'Failed to read PDF file. Please ensure it is a valid PDF document.' },
        { status: 422 }
      );
    }

    if (!pdfText || pdfText.trim().length < 50) {
      return NextResponse.json(
        { message: 'Could not extract text from PDF. The file may be image-based or corrupted.' },
        { status: 422 }
      );
    }

    // Extract data using rules first (fast, always available)
    const rulesData = extractWithRules(pdfText);

    // Try LLM extraction (OpenAI first, then Claude)
    let llmData = null;

    // Try OpenAI
    llmData = await extractWithOpenAI(pdfText);

    // If OpenAI failed, try Claude
    if (!llmData) {
      llmData = await extractWithClaude(pdfText);
    }

    // Merge results (LLM takes precedence, rules fill gaps)
    const finalData = mergeExtractedData(llmData, rulesData);

    // Add raw text for debugging/reference
    finalData.rawText = pdfText.substring(0, 5000); // First 5000 chars for reference

    return NextResponse.json(finalData);

  } catch (error) {
    console.error('PDF parsing error:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to process PDF' },
      { status: 500 }
    );
  }
}

// Also support GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    capabilities: {
      pdfParsing: true,
      openAI: !!process.env.OPENAI_API_KEY,
      claude: !!process.env.ANTHROPIC_API_KEY,
    },
  });
}
