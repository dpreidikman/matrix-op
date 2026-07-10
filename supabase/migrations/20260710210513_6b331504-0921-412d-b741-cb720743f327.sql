DROP POLICY IF EXISTS "Public read vinson daily sales" ON public.vinson_daily_sales;
REVOKE SELECT ON public.vinson_daily_sales FROM anon;
REVOKE SELECT ON public.vinson_daily_sales FROM authenticated;
GRANT ALL ON public.vinson_daily_sales TO service_role;