// Supabase Edge Function with base64 image support and proper Gemini parsing
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
// Define Gemini function schema
const cafeMenu = {
  name: "cafe_item",
  description: "Details about an item served in a Cafe",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the Cafe Item"
      },
      category: {
        type: "string",
        description: 'Category under which the Item Falls? Available Caetgories are:["Coffee","Tea","Iced Beverages","Pastries","Smoothies","Juices",]'
      },
      size_options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            size: {
              type: "string",
              description: 'Size of the cafe Item'
            },
            price: {
              type: "number",
              description: 'Price of the cafe Item for its corresponding size'
            }
          },
          required: [
            "size",
            "price"
          ]
        }
      },
      dairy_options: {
        type: "array",
        items: {
          type: "string"
        },
        description:'What are all the diary options available for this cafe Item. These are options available: ["Oat Milk", "Almond Milk", "2% Milk", "Whole Milk", "Non-Dairy"]'
      },
      tags: {
        type: "array",
        items: {
          type: "string"
        },
        description:'Tags for cafe Items. Available tags:["vegan", "gluten-free", "caffeinated", "popular", "seasonal"]'
      },
      description: {
        type: "string",
        description:"Desciption about the cafe Item"
      },
      form_options: {
        type: "array",
        items: {
          type: "string"
        },
        description:'Diffent form factors of the cafe Item. Available forms:["Hot", "Cold", "Frozen"]'
      }
    },
    required: [
      "name",
      "category",
      "size_options",
      "dairy_options",
      "tags",
      "description"
    ]
  }
};
// Enable CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const { base64, mimeType } = await req.json();
    if (!base64 || !mimeType) {
      return new Response(JSON.stringify({
        error: "Missing base64 or mimeType"
      }), {
        status: 400,
        headers: corsHeaders
      });
    }
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "Missing GEMINI_API_KEY"
      }), {
        status: 500,
        headers: corsHeaders
      });
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash"
    });
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64
              }
            },
            {
              text: "Generate details about the items in the menu"
            }
          ]
        }
      ],
      tools: [
        {
          function_declarations: [
            cafeMenu
          ]
        }
      ]
    });
    // ✅ Extract from correct response shape
    const parts = result.response?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) {
      return new Response(JSON.stringify({
        error: "No content parts returned from Gemini"
      }), {
        status: 400,
        headers: corsHeaders
      });
    }
    const calls = parts.filter((p)=>p.functionCall).map((p)=>({
        functionName: p.functionCall.name,
        arguments: p.functionCall.args
      }));
    if (calls.length === 0) {
      return new Response(JSON.stringify({
        error: "No function calls found in response"
      }), {
        status: 400,
        headers: corsHeaders
      });
    }
    return new Response(JSON.stringify(calls), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("Error processing request:", err);
    return new Response(JSON.stringify({
      error: "Internal server error"
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
