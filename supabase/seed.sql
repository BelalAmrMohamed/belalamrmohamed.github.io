insert into public.portfolio_projects (title, summary, category, project_url, github_url, image_url, featured, status)
values
  (
    'Number Systems App',
    'A learning-focused app for binary, decimal, octal, and hexadecimal conversion.',
    'Mobile App',
    'https://github.com/BelalAmrMohamed/NumberSystemsApp',
    'https://github.com/BelalAmrMohamed/NumberSystemsApp',
    'images/portfolio/gellary/g-numbersystems.jpg',
    true,
    'featured'
  ),
  (
    'Encryption Methods',
    'An educational website for explaining classic ciphers and cryptographic techniques.',
    'Education',
    'https://belalamrmohamed.github.io/Encryption-Methods/',
    'https://github.com/BelalAmrMohamed/Encryption-Methods',
    'images/portfolio/gellary/g-encyption.jpg',
    true,
    'active'
  ),
  (
    'Quiz Master',
    'A student-focused platform for logic, programming, and AI revision quizzes.',
    'Web Platform',
    'https://basmagi-quiz.vercel.app/',
    'https://github.com/BelalAmrMohamed',
    'images/portfolio/gellary/g-quiz.jpg',
    false,
    'active'
  );

insert into public.portfolio_settings (key, value)
values
  ('site_title', 'Belal Amr'),
  ('site_tagline', 'Programmer & backend developer based in Egypt')
on conflict (key) do update set value = excluded.value, updated_at = now();
