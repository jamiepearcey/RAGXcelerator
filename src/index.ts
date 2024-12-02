import { createServer } from './api/server';
import { env } from './env';

async function startServer() {
    try {
        const app = await createServer();
        const port = env.server.port;

        app.listen(port, () => {
            console.log(`
🚀 Server is running!
📝 API Documentation: http://localhost:${port}/api-docs
🏥 Health Check: http://localhost:${port}/health
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start server if this file is run directly
if (require.main === module) {
    startServer();
}

// Export for use as a module
export { startServer }; 