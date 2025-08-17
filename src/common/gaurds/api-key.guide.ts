import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AppsService } from '../config/apps.service';

@Injectable()
export class ApiKeyGaurd implements CanActivate {
  constructor(private readonly appsService: AppsService) {}
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const key = context.switchToHttp().getRequest().headers['x-api-key'];
    console.log('api key ', key);
    const found = this.appsService.findAppNameByKey(key);
    console.log('found app name ', found);
    if (!found) throw new UnauthorizedException('Bad API key');
    return true;
  }
}
