import { IModelApiConfig, IEnv } from "../interfaces";

export class ModelProvider<T> {
    private models: Record<string, (config: IModelApiConfig, env: IEnv) => T>;

    constructor(models: Record<string, (config: IModelApiConfig, env: IEnv) => T>) {
        this.models = models;
    }

    public getModel(config: IModelApiConfig, env: IEnv) : T {
        const modelFactory = this.models[config.provider]

        if (!modelFactory) {
            throw new Error(`Model ${config.model} not found`);
        }

        return modelFactory(config, env);
    }

    public addAdditionalModel(key: string, factory: (config: IModelApiConfig, env: IEnv) => T) {
        this.models[key] = factory;
    }
}
