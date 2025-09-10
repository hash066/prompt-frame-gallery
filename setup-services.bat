@echo off
echo Setting up Redis and MinIO for Image Gallery...

echo.
echo 1. Starting Redis...
start "Redis" cmd /k "redis-server"

echo.
echo 2. Starting MinIO...
start "MinIO" cmd /k "minio server C:\minio-data --console-address :9001"

echo.
echo Services are starting...
echo Redis will be available at: localhost:6379
echo MinIO will be available at: localhost:9000
echo MinIO Console will be available at: http://localhost:9001
echo.
echo Default MinIO credentials:
echo Username: minioadmin
echo Password: minioadmin
echo.
echo Press any key to continue...
pause > nul


