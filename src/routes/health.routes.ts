import { Router } from 'express';

class HealthRoutes {
  private static instance: HealthRoutes | null = null;

  private readonly router: Router;

  private constructor() {
    this.router = Router();

    this.router.get('/health', (_request, response) => {
      response.status(200).json({
        status: 'ok'
      });
    });
  }

  public static getRouter(): Router {
    if (!this.instance) {
      this.instance = new HealthRoutes();
    }

    return this.instance.router;
  }
}

export const registerHealthRoutes = () => HealthRoutes.getRouter();