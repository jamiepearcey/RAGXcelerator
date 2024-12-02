import { IModelApiConfig, IEnv } from "../interfaces";

export class ModelProvider<T> {
    private models: Record<string, (config: IModelApiConfig, env: IEnv) => T>;

    constructor(models: Record<string, (config: IModelApiConfig, env: IEnv) => T>) {
        this.models = models;
    }

    public getModel(config: IModelApiConfig, env: IEnv) : T {
        return this.models[config.model](config, env);
    }

    public addAdditionalModel(key: string, factory: (config: IModelApiConfig, env: IEnv) => T) {
        this.models[key] = factory;
    }
}
