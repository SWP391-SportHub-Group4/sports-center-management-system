using Microsoft.OpenApi;

namespace SportHub.API.Extensions;

public static class SwaggerExtensions
{
    public static IServiceCollection AddSportHubSwagger(this IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo()
            {
                Title = "SportHub API",
                Version = "v1",
            });

            // TODO (sau khi có JWT - xem JwtExtensions.cs): thêm SecurityDefinition + SecurityRequirement
            // để Swagger UI có nút "Authorize" nhập Bearer token.
        });

        return services;
    }

    public static WebApplication UseSportHubSwagger(this WebApplication app)
    {
        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }

        return app;
    }
}
