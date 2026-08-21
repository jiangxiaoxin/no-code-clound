import { CanActivate, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ExecutionContext } from "@nestjs/common";
import { Observable } from "rxjs";
import { Roles } from "src/common/decorator/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        // 从decorator 上拿出配置了什么角色可以访问
        const roles = this.reflector.getAllAndOverride<string[]>(Roles, [
            context.getHandler(),
            context.getClass(),
        ])
        console.log('=====roles', roles);
        if(!roles || roles.length === 0) {
            return true
        }
        const request = context.switchToHttp().getRequest()
        const user = request.user
        console.log('=====user', user);
        
        return true
    }
}