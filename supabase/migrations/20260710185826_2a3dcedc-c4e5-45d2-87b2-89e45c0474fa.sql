CREATE TABLE public.vinson_daily_sales (
  store_id INTEGER NOT NULL,
  date DATE NOT NULL,
  total NUMERIC NOT NULL DEFAULT 0,
  shifts JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, date)
);
GRANT SELECT ON public.vinson_daily_sales TO anon, authenticated;
GRANT ALL ON public.vinson_daily_sales TO service_role;
ALTER TABLE public.vinson_daily_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read vinson daily sales" ON public.vinson_daily_sales FOR SELECT USING (true);
CREATE INDEX vinson_daily_sales_date_idx ON public.vinson_daily_sales (date);