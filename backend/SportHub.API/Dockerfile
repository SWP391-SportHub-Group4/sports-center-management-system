FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
USER $APP_UID
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["SportHub.API/SportHub.API.csproj", "SportHub.API/"]
COPY ["SportHub.Service/SportHub.Service.csproj", "SportHub.Service/"]
COPY ["SportHub.Repository/SportHub.Repository.csproj", "SportHub.Repository/"]
RUN dotnet restore "SportHub.API/SportHub.API.csproj"
COPY . .
WORKDIR "/src/SportHub.API"
RUN dotnet build "./SportHub.API.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./SportHub.API.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "SportHub.API.dll"]
