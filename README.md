# Pharmacy Management System

A comprehensive pharmacy management system built with Next.js, Supabase, and TypeScript. This system provides complete functionality for managing medicines, customers, prescriptions, suppliers, and sales operations.

## Features

### Core Functionality
- **Inventory Management**: Complete medicine inventory with stock tracking, expiry monitoring, and automated alerts
- **Customer Management**: Customer profiles with contact information, insurance details, and prescription history
- **Prescription Management**: Digital prescription processing with doctor verification and fulfillment tracking
- **Sales & Billing**: Point-of-sale system with cart management, payment processing, and receipt generation
- **Supplier Management**: Supplier database with contact information and product catalogs
- **User Management**: Role-based access control (Admin, Pharmacist, Cashier)

### Advanced Features
- **Real-time Notifications**: Low stock alerts, expiry warnings, and prescription updates
- **Advanced Search & Filtering**: Comprehensive search across all entities
- **Bulk Operations**: Mass updates and data management
- **Data Export**: Export functionality for reports and compliance
- **Business Logic**: Automated inventory updates, prescription validation, and business rules
- **Error Handling**: Comprehensive error management with user-friendly messages
- **Performance Monitoring**: System health checks and performance optimization

## Technology Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Backend**: Supabase (PostgreSQL, Authentication, Real-time)
- **UI Components**: shadcn/ui, Tailwind CSS
- **State Management**: React Hooks, Supabase Real-time
- **Authentication**: Supabase Auth with role-based access

## Getting Started

### Prerequisites
- Node.js 18+ 
- Supabase account
- Git

### Installation

1. Clone the repository
\`\`\`bash
git clone <repository-url>
cd pharmacy-management
\`\`\`

2. Install dependencies
\`\`\`bash
npm install
\`\`\`

3. Set up environment variables
\`\`\`bash
# Copy environment variables from Vercel project settings
# Required variables:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
\`\`\`

4. Run database migrations
\`\`\`bash
# Execute the SQL scripts in order:
# - scripts/01-create-pharmacy-tables.sql
# - scripts/02-seed-initial-data.sql
# - scripts/03-add-controlled-substance-column.sql
\`\`\`

5. Start the development server
\`\`\`bash
npm run dev
\`\`\`

## Database Schema

### Core Tables
- **medicines**: Medicine inventory with pricing, stock, and regulatory information
- **customers**: Customer profiles and contact information
- **prescriptions**: Digital prescriptions with doctor and medicine details
- **suppliers**: Supplier information and contact details
- **sales**: Sales transactions and payment records
- **users**: User accounts with role-based permissions

### Key Relationships
- Medicines → Categories, Suppliers
- Prescriptions → Customers, Medicines, Doctors
- Sales → Customers, Medicines
- Users → Role-based permissions

## User Roles

### Administrator
- Full system access
- User management
- System configuration
- Reports and analytics

### Pharmacist
- Prescription management
- Inventory control
- Customer records
- Sales processing

### Cashier
- Sales transactions
- Basic customer lookup
- Inventory viewing

## API Endpoints

The system uses Supabase's auto-generated REST API with the following main endpoints:

- `/api/medicines` - Medicine inventory management
- `/api/customers` - Customer management
- `/api/prescriptions` - Prescription processing
- `/api/suppliers` - Supplier management
- `/api/sales` - Sales transactions
- `/api/users` - User management

## Security Features

- Row Level Security (RLS) policies
- Role-based access control
- Input validation and sanitization
- Secure authentication with JWT tokens
- HTTPS enforcement
- SQL injection prevention

## Performance Optimizations

- Database indexing for fast queries
- Real-time subscriptions for live updates
- Optimistic UI updates
- Image optimization
- Code splitting and lazy loading
- Caching strategies

## Compliance & Regulations

- HIPAA compliance considerations
- Prescription tracking and audit trails
- Controlled substance monitoring
- Data retention policies
- Backup and recovery procedures

## Deployment

The system is designed for deployment on Vercel with Supabase:

1. Connect your repository to Vercel
2. Configure environment variables
3. Deploy with automatic CI/CD

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For support and questions:
- Check the documentation
- Review error logs in the system health monitor
- Contact the development team

## License

This project is licensed under the MIT License.
