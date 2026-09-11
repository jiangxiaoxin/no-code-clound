package com.example.flowable.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Boot 集成版入口：flowable-spring-boot-starter 自动创建引擎、自动部署 processes/ 下的 BPMN。
 * 委托/监听器类与控制台版字节级相同（同包名），BPMN 里写死的 class 两边都能解析。
 */
@SpringBootApplication
public class BootApplication {

    public static void main(String[] args) {
        SpringApplication.run(BootApplication.class, args);
    }
}
