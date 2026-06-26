import os
import json
import mimetypes
import falcon

FLOWS_DIR = os.path.join(os.path.dirname(__file__), '..', 'flows')
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), '..', 'upload')

os.makedirs(UPLOAD_DIR, exist_ok=True)


class FlowFileResource:
    """GET/POST  /apfsconnect/api/flows/file
    Save a flow JSON to disk and hot-reload the registry.
    """

    def on_get(self, req, resp):
        try:
            files = sorted(f.replace('.json', '') for f in os.listdir(FLOWS_DIR) if f.endswith('.json'))
            resp.media = {'flows': files}
        except Exception as e:
            resp.status = falcon.HTTP_500
            resp.media = {'error': str(e)}

    def on_post(self, req, resp):
        from setup import global_registry
        try:
            body = req.media
            flow_id = (body.get('id') or '').strip()
            if not flow_id:
                resp.status = falcon.HTTP_400
                resp.media = {'error': 'Flow id is required'}
                return

            filename = f'{flow_id}.json'
            path = os.path.join(FLOWS_DIR, filename)
            with open(path, 'w') as f:
                json.dump(body, f, indent=4)

            global_registry.load_flow(filename)

            resp.status = falcon.HTTP_200
            resp.media = {'message': f"Flow '{flow_id}' saved and registry reloaded.", 'path': path}
        except Exception as e:
            resp.status = falcon.HTTP_500
            resp.media = {'error': str(e)}


class UploadServeResource:
    """GET  /apfsconnect/api/uploads/{filename}
    Serve files that were uploaded via /apfsconnect/api/upload.
    """

    def on_get(self, req, resp, filename):
        safe = os.path.basename(filename)
        path = os.path.join(UPLOAD_DIR, safe)
        if not os.path.exists(path):
            resp.status = falcon.HTTP_404
            resp.media = {'error': 'File not found'}
            return
        mime, _ = mimetypes.guess_type(path)
        resp.content_type = mime or 'application/octet-stream'
        with open(path, 'rb') as f:
            resp.data = f.read()


SYSTEM_PROMPT = """You are an expert WhatsApp chatbot flow designer for APFS Connect, a financial services company.
Generate a complete, professional conversational flow as strict JSON.

Guidelines:
- Use WhatsApp formatting in text: *bold*, _italic_, emojis for warmth
- Button interactive: up to 3 buttons, titles max 20 chars
- List interactive: logical sections with rows
- Processors with wait:true pause for user input; {{user_id}}, {{id}}, {{value}} are template vars
- Keep flows concise — 3 to 8 steps is ideal
- Use professional financial services language
- Return ONLY valid JSON, nothing else
"""

FLOW_JSON_SCHEMA = """{
  "name": "Human-readable name",
  "id": "snake_case_id",
  "trigger": "/command",
  "is_active": true,
  "steps": [
    {
      "id": "step1",
      "name": "Step Name",
      "content": {
        "type": "text",
        "body": "Message with *bold* and _italic_"
      },
      "processor": []
    },
    {
      "id": "step2",
      "name": "Button Step",
      "content": {
        "type": "interactive",
        "body": {
          "type": "button",
          "header": {"type": "text", "text": "Header text"},
          "body": {"text": "Body message"},
          "footer": {"text": "Footer text"},
          "action": {
            "buttons": [
              {"type": "reply", "reply": {"id": "btn_yes", "title": "Yes"}},
              {"type": "reply", "reply": {"id": "btn_no", "title": "No"}}
            ]
          }
        }
      },
      "processor": [{"name": "process_response", "wait": true, "payload_template": {"user_id": "{{user_id}}", "id": "{{id}}", "value": "{{value}}"}}]
    },
    {
      "id": "step3",
      "name": "List Step",
      "content": {
        "type": "interactive",
        "body": {
          "type": "list",
          "header": {"type": "text", "text": "Header"},
          "body": {"text": "Choose an option:"},
          "footer": {"text": "Footer"},
          "action": {
            "button": "View Options",
            "sections": [{"title": "Section", "rows": [{"id": "row_1", "title": "Option 1", "description": "Description"}]}]
          }
        }
      },
      "processor": [{"name": "process_selection", "wait": true, "payload_template": {"user_id": "{{user_id}}", "id": "{{id}}", "value": "{{value}}"}}]
    }
  ]
}"""


class FlowGenerateResource:
    """POST  /apfsconnect/api/flows/generate
    Generate a flow JSON from a plain-English description using Gemini.

    Architecture: Gemini JSON generation mode — the model is prompted with
    the exact schema and returns a complete, valid flow JSON in one call.
    No external server or complex tool definition needed.
    """

    def on_post(self, req, resp):
        try:
            import google.generativeai as genai
        except ImportError:
            resp.status = falcon.HTTP_500
            resp.media = {'error': 'google-generativeai not installed. Run: pip install google-generativeai'}
            return

        api_key = os.getenv('GOOGLE_API_KEY', '')
        if not api_key:
            resp.status = falcon.HTTP_400
            resp.media = {'error': 'GOOGLE_API_KEY not set in environment'}
            return

        body = req.media or {}
        description = (body.get('description') or '').strip()
        if not description:
            resp.status = falcon.HTTP_400
            resp.media = {'error': 'description is required'}
            return

        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(
                model_name=os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite'),
                generation_config=genai.GenerationConfig(
                    response_mime_type='application/json',
                    temperature=0.8,
                    top_p=0.95,
                    max_output_tokens=4096,
                ),
                system_instruction=SYSTEM_PROMPT,
            )

            prompt = f"""Generate a WhatsApp conversation flow for: {description}

Return JSON exactly matching this schema structure:
{FLOW_JSON_SCHEMA}

Important:
- The "id" field must be snake_case, no spaces
- The "trigger" must start with /
- Each step must have a unique "id"
- Use realistic, professional content for the flow topic
- Add appropriate processors where user input is needed"""

            response = model.generate_content(prompt)
            flow_json = json.loads(response.text)

            # Patch required top-level fields and step metadata
            flow_json.setdefault('is_active', True)
            steps = flow_json.get('steps', [])
            if steps:
                flow_json['start'] = steps[0]['id']
                flow_json['end'] = steps[-1]['id']
            for i, step in enumerate(steps):
                step.setdefault('sequence_no', i + 1)
                step.setdefault('type', 'message')
                step.setdefault('action', 'send_message')
                step.setdefault('is_active', True)
                step.setdefault('processor', [])
                step.setdefault('next_step', steps[i + 1]['id'] if i + 1 < len(steps) else None)

            resp.status = falcon.HTTP_200
            resp.media = flow_json

        except json.JSONDecodeError as e:
            resp.status = falcon.HTTP_500
            resp.media = {'error': f'Gemini returned invalid JSON: {e}'}
        except Exception as e:
            resp.status = falcon.HTTP_500
            resp.media = {'error': str(e)}
