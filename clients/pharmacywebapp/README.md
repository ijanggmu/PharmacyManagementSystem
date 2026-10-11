# 🏥 Pharmacy Management System

A modern, full-stack pharmacy management system for **Nepal-focused pharmacies**, built with Next.js, TypeScript, TanStack Query, and Supabase.

## ✨ Features

- **🔐 Authentication & Authorization** - Multi-tenant auth with role-based access
- **💊 Inventory & purchases** - Stock, GRN, suppliers, purchase orders
- **👥 Customer Management** - Profiles, history, insurance fields
- **📋 Prescriptions** - Dispensing workflow and refill due tracking
- **💰 Sales & POS** - Checkout, credit sales, offline queue, receipts
- **🔄 Returns & Refunds** - Customer returns and credit notes
- **📊 Reports** - Sales analytics, IRD exports, narcotic register
- **📒 Accounting** - GL, AP/AR aging, VAT return summary, reconciliations
- **🎨 Modern UI/UX** - Beautiful, responsive interface with dark mode support
- **🧭 First-login tour** - Guided tour of every module and feature (shown once; restart from user menu)
- **⌨️ Keyboard shortcuts** - Open Point of Sale from anywhere: **Ctrl+K** (Windows/Linux) or **⌘K** (Mac). View all shortcuts via user menu → Keyboard shortcuts

## 🚀 Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **State Management**: TanStack Query (React Query)
- **Backend**: Supabase (PostgreSQL, Auth, Real-time)
- **Deployment**: Vercel (recommended)

## 📁 Project Structure

\`\`\`
PharmacyManagementSystem/
├── app/                          # Next.js app directory
│   ├── auth/                     # Authentication pages
│   ├── dashboard/                # Main application pages
│   └── globals.css              # Global styles
├── components/                   # Reusable components
│   ├── ui/                      # Base UI components (shadcn/ui)
│   ├── sales/                   # Sales-specific components
│   └── [feature]/               # Feature-specific components
├── lib/                         # Shared utilities and configurations
│   ├── api/                     # API functions for each module
│   ├── hooks/                   # TanStack Query hooks
│   ├── supabase/                # Supabase client configuration
│   └── utils/                   # Shared utilities
├── public/                      # Static assets
└── scripts/                     # Database migration scripts
\`\`\`

## 🏗️ Architecture Highlights

### **Modern Data Fetching with TanStack Query**
- Optimistic updates for better UX
- Automatic background refetching
- Intelligent caching and invalidation
- Error handling and retry logic

### **Type-Safe API Layer**
- Centralized API functions with consistent error handling
- Shared utilities for common operations
- Proper TypeScript interfaces throughout

### **Component Architecture**
- Modular, reusable components
- Separation of concerns
- Performance optimizations with React.memo and useMemo

### **Error Handling**
- Comprehensive error boundaries
- User-friendly error messages
- Graceful degradation

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm
- .NET SDK and the .NET API (`backend/dotnet-starter-kit`), which is the only backend

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PharmacyManagementSystem
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Set the base URL of the running .NET API (server-side only; the BFF proxy forwards requests to it):
   ```env
   DOTNET_API_URL=http://localhost:5030
   NEXT_PUBLIC_APP_URL=http://localhost:3000

   # Optional: tenant subdomains (e.g. acme.yourdomain.com → pharmacy code "acme")
   NEXT_PUBLIC_TENANT_ROOT_DOMAIN=yourdomain.com
   ```

4. **Start the .NET API**
   ```bash
   # Follow backend/dotnet-starter-kit for database setup and run instructions.
   # The API must be listening on DOTNET_API_URL (default http://localhost:5030).
   ```

5. **Start the development server**
   ```bash
   pnpm dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📊 Database Schema

The system uses a comprehensive PostgreSQL schema with the following main tables:

- **users** - System users and authentication
- **medicines** - Medicine inventory
- **customers** - Customer information
- **prescriptions** - Prescription records
- **sales** - Sales transactions
- **returns** - Return/refund records
- **suppliers** - Medicine suppliers

## 🔧 Development

### Code Quality Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting and formatting
- **Prettier**: Consistent code formatting
- **Component Structure**: Modular, reusable components
- **Error Handling**: Comprehensive error boundaries and user feedback

### Best Practices Implemented

1. **Performance Optimization**
   - React.memo for expensive components
   - useMemo for expensive calculations
   - Proper loading states and error boundaries

2. **State Management**
   - TanStack Query for server state
   - Local state for UI interactions
   - Optimistic updates for better UX

3. **Type Safety**
   - Strict TypeScript configuration
   - Proper interface definitions
   - Type-safe API responses

4. **Error Handling**
   - Centralized error handling
   - User-friendly error messages
   - Graceful degradation

5. **Code Organization**
   - Feature-based folder structure
   - Shared utilities and types
   - Consistent naming conventions

### Available Scripts

\`\`\`bash
# Development
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm type-check       # Run TypeScript type checking

# Database
pnpm db:push          # Push database changes
pnpm db:reset         # Reset database
pnpm db:seed          # Seed database with sample data
\`\`\`

## 🎯 Key Features

### **Inventory Management**
- Add, edit, and delete medicines
- Stock level tracking with alerts
- Expiry date monitoring
- Category and supplier management

### **Customer Management**
- Customer profiles with contact information
- Purchase history tracking
- Prescription history
- Insurance information

### **Sales Processing**
- Quick sale creation
- Multiple payment methods
- Discount and tax calculation
- Receipt generation

### **Prescription Management**
- Digital prescription entry
- Medicine dispensing tracking
- Prescription status management
- Doctor information tracking

### **Returns & Refunds**
- Return request processing
- Refund calculation
- Status tracking
- Customer communication

### **Reporting & Analytics**
- Sales reports and trends
- Inventory analytics
- Customer insights
- Financial summaries

## 🔒 Security

- **Authentication**: Supabase Auth with JWT tokens
- **Authorization**: Role-based access control
- **Data Validation**: Server-side validation
- **SQL Injection Protection**: Parameterized queries
- **XSS Protection**: Content Security Policy

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Multi-tenant subdomains on Vercel

- Add your project domain (for example, `my-v0-project.vercel.app`) to the project.
- Add a wildcard domain for tenant subdomains, such as `*.my-v0-project.vercel.app`.
- The `middleware.ts` file rewrites `{tenant}.my-v0-project.vercel.app` to the path-based tenant prefix `/t/{tenant}`, so:
  - `https://acme-pharmacy.my-v0-project.vercel.app/login` is handled by `/t/acme-pharmacy/login`.
  - `https://acme-pharmacy.my-v0-project.vercel.app/dashboard` is handled by `/t/acme-pharmacy/dashboard`.
- For a custom domain in the future (for example, `yourapp.com`):
  - Configure DNS with a `CNAME` `*.yourapp.com` pointing to the Vercel-provided target.
  - Update the project-domain constant in `middleware.ts` so the same rewrite logic applies to `*.yourapp.com`.

### Other Platforms

The application can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the documentation in the `/docs` folder
- Review the code comments for implementation details

## 🎉 Acknowledgments

- [shadcn/ui](https://ui.shadcn.com/) for the beautiful component library
- [TanStack Query](https://tanstack.com/query) for excellent data fetching
- [Supabase](https://supabase.com/) for the powerful backend platform
- [Next.js](https://nextjs.org/) for the amazing React framework

---

**Built with ❤️ for modern pharmacy management**
