# PostgreSQL Setup for Image Gallery

This backend now supports storing images directly in PostgreSQL as binary data (BYTEA).

## Quick Setup

1. **Install PostgreSQL** (if not already installed):
   - Windows: Download from https://www.postgresql.org/download/windows/
   - Or use Docker: `docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres`

2. **Create Database**:
   ```sql
   CREATE DATABASE image_gallery;
   CREATE USER postgres WITH PASSWORD 'postgres';
   GRANT ALL PRIVILEGES ON DATABASE image_gallery TO postgres;
   ```

3. **Environment Configuration**:
   - The `.env` file has been created with PostgreSQL settings
   - Default settings:
     - Host: localhost
     - Port: 5432
     - User: postgres
     - Password: postgres
     - Database: image_gallery
     - DB_CLIENT=postgres

4. **Start the Backend**:
   ```bash
   npm start
   ```

## How It Works

- **Upload**: Images are stored as binary data in the `image_blobs` table
- **Download**: Images are streamed directly from PostgreSQL
- **Thumbnails**: Generated on-the-fly using Sharp when requested
- **No MinIO Required**: When using PostgreSQL mode, MinIO is not needed

## Database Schema

The backend automatically creates these tables:
- `images`: Metadata about uploaded images
- `image_blobs`: Binary image data (BYTEA)
- `image_status`: Processing status tracking

## Switching Between Storage Modes

- **PostgreSQL Mode**: Set `DB_CLIENT=postgres` in `.env`
- **SQLite Mode**: Set `DB_CLIENT=sqlite` in `.env` (uses MinIO for storage)

## Troubleshooting

1. **Connection Issues**: Ensure PostgreSQL is running and credentials are correct
2. **Permission Issues**: Make sure the database user has CREATE TABLE permissions
3. **Large Files**: PostgreSQL can handle large binary data, but consider file size limits

## Benefits of PostgreSQL Storage

- ✅ No external storage service needed
- ✅ ACID compliance for data integrity
- ✅ Built-in backup and replication
- ✅ On-the-fly thumbnail generation
- ✅ Direct database queries for metadata
