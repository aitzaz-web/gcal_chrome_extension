import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, timezone, currentTime, localDate, localTime, localDateTime } = req.body;
  if (!text) return res.status(400).json({ error: "Missing text" });

  // Use user's local date if provided, otherwise fall back to UTC calculation
  let todayDate, tomorrowDate;
  
  if (localDate) {
    // Use the user's local date directly
    todayDate = localDate;
    // Calculate tomorrow by parsing the date and adding 1 day
    const [year, month, day] = localDate.split('-').map(Number);
    const tomorrow = new Date(year, month - 1, day + 1); // month is 0-indexed
    tomorrowDate = tomorrow.getFullYear() + '-' + 
                   String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(tomorrow.getDate()).padStart(2, '0');
  } else {
    // Fallback to UTC calculation
    const userCurrentTime = currentTime ? new Date(currentTime) : new Date();
    todayDate = userCurrentTime.toISOString().split("T")[0];
    tomorrowDate = new Date(userCurrentTime.getTime() + 24*60*60*1000).toISOString().split("T")[0];
  }

  const userTimezone = timezone || 'UTC';

  // Debug logging
  console.log('Received request:', { text, timezone, currentTime, localDate, localTime });
  console.log('User timezone:', userTimezone);
  console.log('Calculated dates - Today:', todayDate, 'Tomorrow:', tomorrowDate);

  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `CURRENT DATE AND TIME CONTEXT:
- Current datetime: ${currentTime || new Date().toISOString()}
- User timezone: ${userTimezone}
- Today's date: ${todayDate}
- Current year: ${new Date().getFullYear()}
- Current month: ${new Date().getMonth() + 1}
- Current day: ${new Date().getDate()}

CRITICAL: Today is ${todayDate}. Tomorrow is ${tomorrowDate}.

You are an expert event parser that extracts structured calendar event data from natural language text.

Your task is to parse event information and return ONLY a valid JSON object with these exact fields:
- "title": A concise, descriptive event title (remove redundant date/time info)
- "startTime": ISO 8601 formatted start datetime string
- "endTime": ISO 8601 formatted end datetime string (if duration specified, otherwise null)
- "location": Physical location, venue, or address (empty string if none specified)

PARSING RULES:
1. TIME HANDLING:
   - Extract BOTH start and end times when specified (e.g., "2-3pm", "9:30-11am", "from 2 to 4pm")
   - For time ranges: parse start time and end time separately
   - Default start time to 6:00 PM (18:00) for events with only date specified
   - If only start time given, set endTime to null
   - Handle relative dates (tomorrow, next week, Monday, etc.)
   - Parse 12/24 hour formats, AM/PM indicators
   - Account for common time expressions ("noon", "midnight", "morning", "afternoon", "evening")
   - For "all day" events, use 00:00 start and 23:59 end times

2. RELATIVE TIME EXPRESSIONS (CRITICAL):
   - "in 30 minutes" = add 30 minutes to the EXACT current time provided above
   - "in an hour" = add 1 hour to the EXACT current time provided above
   - "in 2 hours" = add 2 hours to the EXACT current time provided above  
   - "in 15 mins" = add 15 minutes to the EXACT current time provided above
   - "right now" = use the EXACT current time provided above
   - "soon" = add 30 minutes to the EXACT current time provided above
   - ALWAYS calculate relative to the user's current time: ${currentTime || new Date().toISOString()}

3. DATE CALCULATION (CRITICAL):
   - TODAY means: ${todayDate}
   - TOMORROW means: ${tomorrowDate}
   - "today 5pm" = ${todayDate}T17:00:00
   - "tomorrow 5pm" = ${tomorrowDate}T17:00:00
   - Never add extra days beyond what the user specifies
   - "today" = current calendar date only
   - "tomorrow" = next calendar date only

4. DURATION PATTERNS TO RECOGNIZE:
   - "2-3pm", "9:30-11am", "2:00-4:30pm"
   - "from 2 to 4pm", "between 9 and 11am"
   - "9am to 5pm", "10:30 until 12:00"
   - "2pm for 2 hours", "1 hour meeting at 3pm"
   - "all day", "full day", "entire day"
   - "in X minutes/hours for Y minutes/hours"

5. TITLE EXTRACTION:
   - Remove date/time information from the title
   - Remove location information from the title
   - Focus on the core activity or purpose
   - Use context clues to create meaningful titles for vague descriptions

6. LOCATION DETECTION:
   - Look for prepositions: "at", "in", "near", "by", "on"
   - Identify business names, addresses, landmarks
   - Handle virtual locations: "Zoom", "Teams", "online", "virtual"
   - Extract room numbers, building names

7. CONTEXT AWARENESS:
   - Infer event types from keywords (meeting, lunch, appointment, class, etc.)
   - Handle recurring patterns ("every Monday", "weekly")
   - Understand duration indicators ("1 hour", "all day", "quick", "brief")
   - Recognize urgency markers ("ASAP", "urgent", "immediately")

8. AMBIGUITY RESOLUTION:
   - If multiple time ranges mentioned, use the first/primary one
   - For vague locations, prefer specific over general
   - Default to reasonable assumptions for missing information
   - If unclear duration, default to 1 hour for meetings, 2 hours for meals

EXAMPLES OF GOOD PARSING:
- "meeting in an hour with emma" → {"title": "meeting with emma", "startTime": "[current_time + 1 hour]", "endTime": null, "location": ""}
- "lunch in 30 minutes at café rio" → {"title": "lunch", "startTime": "[current_time + 30 min]", "endTime": null, "location": "café rio"}
- "tomorrow 5pm meeting with jack" → {"title": "meeting with jack", "startTime": "${tomorrowDate}T17:00:00", "endTime": null, "location": ""}
- "client presentation next Tuesday 2-3pm in conference room A" → {"title": "client presentation", "startTime": "2025-01-07T14:00:00", "endTime": "2025-01-07T15:00:00", "location": "conference room A"}
- "call in 2 hours for 30 minutes" → {"title": "call", "startTime": "[current_time + 2 hours]", "endTime": "[current_time + 2.5 hours]", "location": ""}

Return ONLY the JSON object, no explanations or additional text.`,
        },
        {
          role: "user",
          content: `Extract event details from this text:\n"${text}"`,
        },
      ],
      temperature: 0,
    });

    const parsed = JSON.parse(chat.choices?.[0]?.message?.content || "{}");
    console.log('OpenAI response:', chat.choices?.[0]?.message?.content);
    console.log('Parsed result:', parsed);
    res.status(200).json(parsed);
  } catch (err) {
    console.error('Detailed error:', err);
    console.error('Error stack:', err.stack);
    console.error('Error message:', err.message);
    res.status(500).json({ error: "Failed to parse event.", details: err.message });
  }
}
