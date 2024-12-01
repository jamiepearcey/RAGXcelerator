FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Set all required environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    # Neo4j Configuration
    NEO4J_URI="" \
    NEO4J_USERNAME="" \
    NEO4J_PASSWORD="" \
    # Supabase Configuration
    SUPABASE_URL="" \
    SUPABASE_ANON_KEY="" \
    # OpenAI Configuration
    OPENAI_API_KEY="" \
    OPENAI_BASE_URL="https://api.openai.com/v1" \
    # LightRAG Configuration
    CHUNK_OVERLAP_TOKEN_SIZE=128 \
    CHUNK_TOKEN_SIZE=1024 \
    TIKTOKEN_MODEL="gpt-4"

EXPOSE $PORT

CMD ["npm", "start"] 