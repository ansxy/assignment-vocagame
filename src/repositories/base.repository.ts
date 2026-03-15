import {
  CreationAttributes,
  FindOptions,
  Model,
  ModelStatic
} from 'sequelize';

import { SQLInstance } from '../database/sql';

type EntityId = number | string;

export abstract class BaseRepository<T extends Model> {
  protected get sqlInstance(): typeof SQLInstance {
    return SQLInstance;
  }

  protected get ormProvider(): typeof import('sequelize') {
    return SQLInstance.getORMProvide();
  }

  protected get db(): ReturnType<typeof SQLInstance.getContext> {
    return SQLInstance.getContext();
  }

  protected constructor(modelOrName?: ModelStatic<T> | string) {
    if (typeof modelOrName === 'string') {
      this.model = SQLInstance.getModel<T>(modelOrName);
      return;
    }

    if (modelOrName) {
      this.model = modelOrName;
      return;
    }

    const repositoryName = this.constructor.name;
    const inferredModelName = repositoryName.endsWith('Repository')
      ? `${repositoryName.replace(/Repository$/, '')}Model`
      : repositoryName;

    this.model = SQLInstance.getModel<T>(inferredModelName);
  }

  protected readonly model: ModelStatic<T>;

  async findAll(options?: FindOptions): Promise<T[]> {
    return this.model.findAll(options);
  }

  async findById(id: EntityId): Promise<T | null> {
    return this.model.findByPk(id);
  }

  async findOne(options: FindOptions): Promise<T | null> {
    return this.model.findOne(options);
  }

  async create(payload: CreationAttributes<T>): Promise<T> {
    return this.model.create(payload);
  }

  async updateById(
    id: EntityId,
    payload: Partial<CreationAttributes<T>>
  ): Promise<T | null> {
    const entity = await this.findById(id);

    if (!entity) {
      return null;
    }

    return entity.update(payload);
  }

  async deleteById(id: EntityId): Promise<boolean> {
    const entity = await this.findById(id);

    if (!entity) {
      return false;
    }

    await entity.destroy();

    return true;
  }

  async findOneOrFail(options: FindOptions): Promise<T> {
    const entity = await this.model.findOne(options);
    if (!entity) {
      throw new Error(`${this.model.name} not found`);
    }

    return entity;
  }

}