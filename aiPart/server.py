import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

# Ensure current directory is in sys.path to import main
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import main

# Cache to store initialized chains per video_id
chains = {}

def get_or_create_chain(video_id: str, query: str, strictness: str):
    """
    Retrieves cached chain or initializes a new one using functions from main.py
    """
    if video_id in chains:
        return chains[video_id]

    transcript = main.get_transcript(video_id)
    if not transcript:
        raise ValueError(f"Could not retrieve transcript for video ID: {video_id}")

    store = main.create_store(transcript, main.emmbedding, main.splitter)
    chain = main.create_chain(store, query, strictness, main.llm, main.prompt, main.parser)
    chains[video_id] = chain
    return chain

class RequestHandler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors()
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        data = json.loads(self.rfile.read(content_length).decode("utf-8"))

        video_id = data.get("video_id")
        query = data.get("query")
        strictness = data.get("strictness", "Level 2")

        print(f"[{video_id}] ({strictness}) Query: {query}")

        try:
            chain = get_or_create_chain(video_id, query, strictness)
            reply = chain.invoke({"query": query, "strictness": strictness})
            response_bytes = json.dumps({"reply": reply}).encode("utf-8")
            self.send_response(200)
        except Exception as e:
            print(f"Error processing query: {e}")
            response_bytes = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(500)

        self._send_cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(response_bytes)

def run(port=8000):
    server = HTTPServer(("127.0.0.1", port), RequestHandler)
    print(f"Server running at http://127.0.0.1:{port}/api/chat")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        server.server_close()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run(port)
