import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Rate an outfit using GPT-4 Vision
 * @param {string} imageBase64 - Base64 encoded image data URL
 * @param {string} occasion - The occasion for the outfit
 * @param {string} budget - Optional budget (e.g., "USD 500")
 * @returns {Promise<object>} - Outfit rating and recommendations
 */
export async function rateOutfit(imageBase64, occasion, budget = null) {
  try {
    const budgetText = budget ? `The user has a budget of ${budget}.` : '';

    const prompt = `You are a professional fashion stylist. Analyze this outfit image for the occasion: "${occasion}". ${budgetText}

Please provide a detailed analysis in the following JSON format (respond ONLY with valid JSON, no other text):

{
  "wow_factor": <number 1-10>,
  "occasion_fitness": <number 1-10>,
  "overall_rating": <number 1-10>,
  "wow_factor_explanation": "<detailed explanation of wow factor score>",
  "occasion_fitness_explanation": "<detailed explanation of occasion fitness score>",
  "overall_explanation": "<overall assessment of the outfit>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>", "<strength 4>", "<strength 5>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>", "<improvement 4>", "<improvement 5>"],
  "suggestions": ["<styling suggestion 1>", "<styling suggestion 2>", "<styling suggestion 3>", "<styling suggestion 4>", "<styling suggestion 5>"],
  "shopping_recommendations": [
    {
      "item": "<item name>",
      "description": "<item description>",
      "price": "<estimated price>",
      "reason": "<why this item is recommended>"
    }
  ]
}

Provide 2-5 items in each array. Make shopping recommendations budget-aware if budget is provided.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64,
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const result = response.choices[0].message.content;
    return JSON.parse(result);
  } catch (error) {
    console.error('Error rating outfit:', error);
    throw new Error(`Failed to rate outfit: ${error.message}`);
  }
}

/**
 * Generate outfit description and recommendations using GPT-4
 * @param {object} params - Generation parameters
 * @returns {Promise<object>} - Outfit description and product recommendations
 */
export async function generateOutfitDescription(params) {
  const {
    wowFactor,
    brands = [],
    budget,
    occasion,
    conditions = '',
  } = params;

  try {
    const wowFactorLabel =
      wowFactor <= 3
        ? 'Classic & Safe'
        : wowFactor <= 6
        ? 'Balanced & Stylish'
        : 'Bold & Creative';

    const brandsText =
      brands.length > 0
        ? `Preferred brands: ${brands.join(', ')}.`
        : '';
    const conditionsText = conditions
      ? `Special requirements: ${conditions}.`
      : '';

    const prompt = `You are a professional fashion stylist. Create a detailed outfit recommendation for the following:

- Occasion: ${occasion}
- Style Level: ${wowFactorLabel} (${wowFactor}/10)
- Budget: ${budget}
${brandsText}
${conditionsText}

Please provide a complete outfit concept in the following JSON format (respond ONLY with valid JSON, no other text):

{
  "outfit_concept": "<overall concept and inspiration>",
  "items": [
    {
      "type": "top",
      "description": "<detailed description>",
      "color": "<color description>",
      "style_notes": "<styling notes>"
    },
    {
      "type": "bottom",
      "description": "<detailed description>",
      "color": "<color description>",
      "style_notes": "<styling notes>"
    },
    {
      "type": "shoes",
      "description": "<detailed description>",
      "color": "<color description>",
      "style_notes": "<styling notes>"
    },
    {
      "type": "accessories",
      "description": "<detailed description>",
      "color": "<color description>",
      "style_notes": "<styling notes>"
    }
  ],
  "color_palette": "<explanation of the color scheme>",
  "occasion_notes": "<why this outfit works for the occasion>",
  "product_recommendations": [
    {
      "item": "<item name>",
      "type": "<top|bottom|shoes|accessories|outerwear>",
      "brand": "<suggested brand>",
      "description": "<product description>",
      "price": "<estimated price>",
      "reason": "<why this product fits the outfit>"
    }
  ]
}

Provide 5-8 product recommendations that fit within the budget. Consider the preferred brands if provided.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const result = response.choices[0].message.content;
    return JSON.parse(result);
  } catch (error) {
    console.error('Error generating outfit description:', error);
    throw new Error(`Failed to generate outfit description: ${error.message}`);
  }
}

/**
 * Create a detailed prompt for image generation
 * @param {object} outfitDescription - The outfit description from GPT-4
 * @param {string} occasion - The occasion
 * @returns {string} - Image generation prompt
 */
export function createImagePrompt(outfitDescription, occasion) {
  const items = outfitDescription.items || [];
  const itemDescriptions = items
    .map((item) => `${item.type}: ${item.description}, ${item.color}`)
    .join('; ');

  const prompt = `Professional fashion photography of a person wearing: ${itemDescriptions}.
${outfitDescription.outfit_concept}.
Appropriate for ${occasion}.
${outfitDescription.color_palette}.
High-quality, well-lit, full-body shot, fashion magazine style, detailed clothing, realistic, 8k, professional photography.`;

  return prompt;
}
