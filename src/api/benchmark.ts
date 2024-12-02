import { Router, Request, Response } from 'express';
import { LightRAG, DEFAULT_QUERY_PARAM } from '../light-rag';
import { QueryParam } from '../interfaces';

export function createBenchmarkRouter(lightRAG: LightRAG) {
    const router = Router();

    /**
     * @openapi
     * /api/benchmark/compare:
     *   post:
     *     summary: Compare different query modes
     *     description: Run the same query across all modes and compare performance
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - query
     *             properties:
     *               query:
     *                 type: string
     *                 description: The query to test
     *               text:
     *                 type: string
     *                 description: Optional custom text to use for testing
     *     responses:
     *       200:
     *         description: Comparison results
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 query:
     *                   type: string
     *                 text:
     *                   type: string
     *                   enum: [sample, custom]
     *                 results:
     *                   type: object
     *                   additionalProperties:
     *                     type: object
     *                     properties:
     *                       sampleText:
     *                         type: string
     *                       response:
     *                         type: string
     *                       performance:
     *                         type: object
     *                         properties:
     *                           durationMs:
     *                             type: number
     *                           memoryUsage:
     *                             type: object
     *                           mode:
     *                             type: string
     *                 summary:
     *                   type: object
     *                   properties:
     *                     fastestMode:
     *                       type: string
     *                     timings:
     *                       type: object
     *                     memoryUsage:
     *                       type: object
     *       400:
     *         description: Query is required
     *       500:
     *         description: Benchmark failed
     */
    router.post('/compare', async (req: Request, res: Response) => {
        const { query, text } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const results: Record<string, any> = {};
        const modes: QueryParam['mode'][] = ['naive', 'local', 'global', 'hybrid'];

        try {
            // Insert sample or custom text
            const sampleText = text || `
                Apple Inc., under CEO Tim Cook's leadership, has partnered with Microsoft Corporation 
                to develop new AI technologies. Satya Nadella, Microsoft's CEO, announced that this 
                collaboration will integrate OpenAI's GPT-4 technology. Sam Altman, who leads OpenAI, 
                expressed excitement about this partnership which began in Silicon Valley.

                The project team includes Dr. Sarah Chen, Apple's Head of AI Research, working closely 
                with Microsoft's Chief Technology Officer Kevin Scott. They're developing advanced 
                machine learning models at their joint research facility in Cupertino, California.

                Google's CEO Sundar Pichai responded by announcing a competing partnership with Tesla, 
                where Elon Musk serves as CEO. This collaboration focuses on integrating AI technology 
                into autonomous vehicles at Tesla's factory in Austin, Texas.
            `;

            await lightRAG.insert([sampleText]);

            // Run query in each mode and measure performance
            for (const mode of modes) {
                const startTime = process.hrtime();
                const startMemory = process.memoryUsage();

                const response = await lightRAG.query(query, {
                    ...DEFAULT_QUERY_PARAM,
                    mode
                });

                const [seconds, nanoseconds] = process.hrtime(startTime);
                const endMemory = process.memoryUsage();
                const duration = seconds * 1000 + nanoseconds / 1000000;

                results[mode] = {
                    sampleText,
                    response,
                    performance: {
                        durationMs: duration,
                        memoryUsage: {
                            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
                            external: endMemory.external - startMemory.external,
                            rss: endMemory.rss - startMemory.rss,
                            arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
                        },
                        mode
                    }
                };
            }

            res.json({
                query,
                text: text ? 'custom' : 'sample',
                results,
                summary: {
                    fastestMode: Object.entries(results)
                        .sort((a, b) => a[1].performance.durationMs - b[1].performance.durationMs)[0][0],
                    timings: Object.fromEntries(
                        Object.entries(results).map(([mode, data]) => 
                            [mode, data.performance.durationMs]
                        )
                    ),
                    memoryUsage: Object.fromEntries(
                        Object.entries(results).map(([mode, data]) => 
                            [mode, data.performance.memoryUsage]
                        )
                    )
                }
            });

        } catch (error) {
            console.error('Benchmark error:', error);
            res.status(500).json({ 
                error: 'Benchmark failed',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    /**
     * @openapi
     * /api/benchmark/query:
     *   post:
     *     summary: Benchmark single query mode
     *     description: Run performance tests on a specific query mode with multiple iterations
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - query
     *             properties:
     *               query:
     *                 type: string
     *                 description: The query to test
     *               mode:
     *                 type: string
     *                 enum: [local, global, hybrid, naive]
     *                 default: local
     *                 description: Query mode to test
     *               iterations:
     *                 type: integer
     *                 minimum: 1
     *                 default: 1
     *                 description: Number of test iterations
     *     responses:
     *       200:
     *         description: Benchmark results
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 query:
     *                   type: string
     *                 mode:
     *                   type: string
     *                 iterations:
     *                   type: integer
     *                 metrics:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       iteration:
     *                         type: integer
     *                       durationMs:
     *                         type: number
     *                       response:
     *                         type: string
     *                       memoryUsage:
     *                         type: object
     *                       timestamp:
     *                         type: string
     *                 summary:
     *                   type: object
     *                   properties:
     *                     duration:
     *                       type: object
     *                       properties:
     *                         average:
     *                           type: number
     *                         min:
     *                           type: number
     *                         max:
     *                           type: number
     *                         standardDeviation:
     *                           type: number
     *                     memory:
     *                       type: object
     *                     timestamp:
     *                       type: string
     *       400:
     *         description: Query is required
     *       500:
     *         description: Benchmark failed
     */
    router.post('/query', async (req: Request, res: Response) => {
        const { query, mode = 'local', iterations = 1 } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        try {
            const metrics: {
                iteration: number;
                durationMs: number;
                tokensProcessed?: number;
                response: string
                memoryUsage?: NodeJS.MemoryUsage;
                timestamp: string;
            }[] = [];

            // Run multiple iterations if requested
            for (let i = 0; i < iterations; i++) {
                const startTime = process.hrtime();
                const startMemory = process.memoryUsage();

                const response = await lightRAG.query(query, {
                    ...DEFAULT_QUERY_PARAM,
                    mode: mode as QueryParam['mode']
                });

                const [seconds, nanoseconds] = process.hrtime(startTime);
                const endMemory = process.memoryUsage();
                const duration = seconds * 1000 + nanoseconds / 1000000;

                metrics.push({
                    iteration: i + 1,
                    durationMs: duration,
                    response,
                    memoryUsage: {
                        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
                        external: endMemory.external - startMemory.external,
                        rss: endMemory.rss - startMemory.rss,
                        arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
                    },
                    timestamp: new Date().toISOString()
                });
            }

            // Calculate aggregate metrics
            const durations = metrics.map(m => m.durationMs);
            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
            const minDuration = Math.min(...durations);
            const maxDuration = Math.max(...durations);
            const stdDev = Math.sqrt(
                durations.reduce((sq, n) => sq + Math.pow(n - avgDuration, 2), 0) / durations.length
            );

            // Memory metrics
            const avgMemoryUsage = metrics.reduce((acc, m) => ({
                heapUsed: acc.heapUsed + (m.memoryUsage?.heapUsed || 0),
                heapTotal: acc.heapTotal + (m.memoryUsage?.heapTotal || 0),
                external: acc.external + (m.memoryUsage?.external || 0),
                rss: acc.rss + (m.memoryUsage?.rss || 0)
            }), {
                heapUsed: 0,
                heapTotal: 0,
                external: 0,
                rss: 0
            });

            Object.keys(avgMemoryUsage).forEach(key => {
                avgMemoryUsage[key as keyof typeof avgMemoryUsage] /= metrics.length;
            });

            res.json({
                query,
                mode,
                iterations,
                metrics,
                summary: {
                    duration: {
                        average: avgDuration,
                        min: minDuration,
                        max: maxDuration,
                        standardDeviation: stdDev
                    },
                    memory: avgMemoryUsage,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Query benchmark error:', error);
            res.status(500).json({
                error: 'Query benchmark failed',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    return router;
}