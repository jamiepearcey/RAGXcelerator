import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
    LoggerProvider,
    SimpleLogRecordProcessor
  } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';

import { logger, setLogger } from '../utils';

export function setupTelemetry(config: {
    serviceName: string;
    environment: string;
    otlpEndpoint?: string;
    enabled?: boolean;
}) {
    if (!config.enabled) {
        logger.info('Telemetry disabled');
        return;
    }

    const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.environment,
    });

    const loggerProvider = new LoggerProvider({
        resource
    });

    loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(new OTLPLogExporter({
        url: config.otlpEndpoint + '/v1/logs',
        keepAlive: true,
    })));

    const otelLogger = loggerProvider.getLogger('default');
    setLogger(otelLogger);

    const traceExporter = new OTLPTraceExporter({
        url: config.otlpEndpoint + '/v1/traces',
        headers: {},
    });

    const sdk = new NodeSDK({
        resource, 
        traceExporter,
        instrumentations: [
            new HttpInstrumentation({
                ignoreIncomingRequestHook: (request) => request.url ? ['/health', '/api-docs'].some(path => request?.url?.includes(path) ?? false) : false,
            }),
        ],
    });

    try {
        sdk.start();
        logger.info('Telemetry initialized');
    } catch (error) {
        logger.error('Error initializing telemetry:', error);
    }

    process.on('SIGTERM', () => {
        sdk.shutdown()
            .then(() => logger.info('Telemetry terminated'))
            .catch(error => logger.error('Error terminating telemetry:', error))
            .finally(() => process.exit(0));
    });
} 